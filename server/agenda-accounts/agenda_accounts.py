#!/usr/bin/env python3
"""Accounts service for Agenda Sacramental.

Lets a ward's owner/admin create logins and reset passwords from Administração. Sign-up is off on
the shared GoTrue (it also serves forwartrans-hr) and creating users needs the service-role key,
which can't live in the browser, so this tiny service holds it. Standard library only.

  POST /api/accounts        {ward_id, email, name, role}  -> {user_id, email, created, password}
  POST /api/accounts/reset  {ward_id, user_id}            -> {user_id, email, password}

Every call must carry the caller's own access token (Authorization: Bearer ...). The caller must be
an active owner/admin of `ward_id`. New logins get a temporary password and must choose their own
at first sign-in (user_metadata.must_change_password). Only logins this service created
(app_metadata.agenda_managed) can have their password reset, so a ward admin can never touch
someone's forwartrans-hr login.

Config (environment): KONG_URL, ANON_KEY, SERVICE_ROLE_KEY, PORT (default 8790).
"""
import json
import os
import re
import secrets
import sys
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

KONG = os.environ.get("KONG_URL", "http://127.0.0.1:8000")
ANON = os.environ.get("ANON_KEY", "")
SERVICE = os.environ.get("SERVICE_ROLE_KEY", "")
PORT = int(os.environ.get("PORT", "8790"))

ROLES = {"admin", "editor", "music", "viewer"}
ADMIN_ROLES = {"owner", "admin"}
UUID_RE = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
PASSWORD_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789"  # no 0/o, 1/l/i: read aloud or typed from a phone


class ApiError(Exception):
    def __init__(self, status, message):
        super().__init__(message)
        self.status = status
        self.message = message


def temp_password():
    part = lambda: "".join(secrets.choice(PASSWORD_ALPHABET) for _ in range(4))
    return f"Agenda-{part()}-{part()}"


def validate_create(body):
    ward_id = str(body.get("ward_id", "")).strip().lower()
    email = str(body.get("email", "")).strip().lower()
    name = re.sub(r"\s+", " ", str(body.get("name", "")).strip())
    role = str(body.get("role", "")).strip()
    if not UUID_RE.match(ward_id):
        raise ApiError(400, "Ala inválida.")
    if not EMAIL_RE.match(email) or len(email) > 200:
        raise ApiError(400, "E-mail inválido.")
    if not name or len(name) > 80:
        raise ApiError(400, "Escreva o nome (até 80 carateres).")
    if role not in ROLES:
        raise ApiError(400, "Papel inválido.")
    return ward_id, email, name, role


def validate_reset(body):
    ward_id = str(body.get("ward_id", "")).strip().lower()
    user_id = str(body.get("user_id", "")).strip().lower()
    if not UUID_RE.match(ward_id) or not UUID_RE.match(user_id):
        raise ApiError(400, "Pedido inválido.")
    return ward_id, user_id


def call(method, path, body=None, key=None, bearer=None, headers=None):
    req = urllib.request.Request(KONG + path, method=method)
    req.add_header("apikey", key or SERVICE)
    req.add_header("Authorization", "Bearer " + (bearer or key or SERVICE))
    for k, v in (headers or {}).items():
        req.add_header(k, v)
    data = None
    if body is not None:
        data = json.dumps(body).encode()
        req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, data=data, timeout=10) as r:
            raw = r.read()
            return r.status, (json.loads(raw) if raw else None)
    except urllib.error.HTTPError as e:
        raw = e.read()
        try:
            return e.code, json.loads(raw)
        except ValueError:
            return e.code, {"message": raw.decode(errors="replace")[:200]}


REST = {"Accept-Profile": "agenda", "Content-Profile": "agenda"}


def caller_id(token):
    status, user = call("GET", "/auth/v1/user", key=ANON, bearer=token)
    if status != 200 or not user or not user.get("id"):
        raise ApiError(401, "Sessão expirada. Entre de novo.")
    return user["id"]


def membership(ward_id, user_id):
    status, rows = call("GET", f"/rest/v1/ward_users?select=role,status&ward_id=eq.{ward_id}&user_id=eq.{user_id}", headers=REST)
    if status != 200:
        raise ApiError(502, "Não foi possível verificar o acesso.")
    return rows[0] if rows else None


def require_admin(ward_id, token):
    uid = caller_id(token)
    m = membership(ward_id, uid)
    if not m or m["status"] != "active" or m["role"] not in ADMIN_ROLES:
        raise ApiError(403, "Só o bispado (proprietário ou administrador) pode gerir contas.")
    return uid


def create_account(body, token):
    ward_id, email, name, role = validate_create(body)
    require_admin(ward_id, token)

    status, existing = call("POST", "/rest/v1/rpc/find_user_id", {"p_email": email}, headers=REST)
    if status != 200:
        raise ApiError(502, "Não foi possível procurar a conta.")
    password = None
    if existing:
        user_id = existing
        current = membership(ward_id, user_id)
        if current and current["role"] == "owner":
            raise ApiError(409, "Essa pessoa já é a proprietária da ala.")
    else:
        password = temp_password()
        status, user = call("POST", "/auth/v1/admin/users", {
            "email": email, "password": password, "email_confirm": True,
            "user_metadata": {"name": name, "must_change_password": True},
            "app_metadata": {"agenda_managed": True},
        })
        if status not in (200, 201) or not user or not user.get("id"):
            raise ApiError(502, "Não foi possível criar a conta.")
        user_id = user["id"]

    status, _ = call("POST", "/rest/v1/ward_users?on_conflict=ward_id,user_id",
                     {"ward_id": ward_id, "user_id": user_id, "role": role, "status": "active", "name": name, "email": email},
                     headers={**REST, "Prefer": "resolution=merge-duplicates,return=minimal"})
    if status not in (200, 201, 204):
        raise ApiError(502, "A conta existe mas não foi possível dar acesso à ala.")
    return {"user_id": user_id, "email": email, "created": password is not None, "password": password}


def reset_password(body, token):
    ward_id, user_id = validate_reset(body)
    require_admin(ward_id, token)
    if not membership(ward_id, user_id):
        raise ApiError(404, "Essa pessoa não tem acesso a esta ala.")
    status, user = call("GET", f"/auth/v1/admin/users/{user_id}")
    if status != 200 or not user:
        raise ApiError(404, "Conta não encontrada.")
    if not (user.get("app_metadata") or {}).get("agenda_managed"):
        raise ApiError(403, "Esta conta não foi criada nesta aplicação; a palavra-passe tem de ser reposta pelo administrador do sistema.")
    password = temp_password()
    meta = {**(user.get("user_metadata") or {}), "must_change_password": True}
    status, _ = call("PUT", f"/auth/v1/admin/users/{user_id}", {"password": password, "user_metadata": meta})
    if status != 200:
        raise ApiError(502, "Não foi possível repor a palavra-passe.")
    return {"user_id": user_id, "email": user.get("email"), "password": password}


ROUTES = {"/api/accounts": create_account, "/api/accounts/reset": reset_password}


class Handler(BaseHTTPRequestHandler):
    server_version = "agenda-accounts"

    def _send(self, status, payload):
        data = json.dumps(payload, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_POST(self):
        route = ROUTES.get(self.path.split("?")[0])
        if not route:
            return self._send(404, {"message": "Not found"})
        auth = self.headers.get("Authorization", "")
        if not auth.startswith("Bearer "):
            return self._send(401, {"message": "Sessão expirada. Entre de novo."})
        try:
            length = min(int(self.headers.get("Content-Length") or 0), 10_000)
            body = json.loads(self.rfile.read(length) or b"{}")
            if not isinstance(body, dict):
                raise ApiError(400, "Pedido inválido.")
            self._send(200, route(body, auth[7:].strip()))
        except ApiError as e:
            self._send(e.status, {"message": e.message})
        except ValueError:
            self._send(400, {"message": "Pedido inválido."})
        except Exception as e:  # noqa: BLE001 - never leak details to the client
            print(f"error on {self.path}: {type(e).__name__}: {e}", file=sys.stderr)
            self._send(500, {"message": "Erro no servidor."})

    def log_message(self, fmt, *args):  # one line per request, no bodies, no tokens
        print(f"{self.address_string()} {fmt % args}", file=sys.stderr)


if __name__ == "__main__":
    if not ANON or not SERVICE:
        sys.exit("ANON_KEY and SERVICE_ROLE_KEY must be set")
    ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
