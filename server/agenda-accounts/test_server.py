"""Unit tests for the pure parts of agenda_accounts.py: python3 -m unittest server/agenda-accounts/test_server.py"""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(__file__))
import agenda_accounts as server  # noqa: E402

WARD = "2f6776a4-ec9e-4e6e-9449-2466f84f1b54"


class TestValidation(unittest.TestCase):
    def test_create_normalises_input(self):
        self.assertEqual(server.validate_create({"ward_id": WARD.upper(), "email": " Ana@Mail.PT ", "name": " Ana   Paula ", "role": "music"}),
                         (WARD, "ana@mail.pt", "Ana Paula", "music"))

    def test_create_rejects_bad_input(self):
        for body in ({"ward_id": "x", "email": "a@b.pt", "name": "A", "role": "viewer"},
                     {"ward_id": WARD, "email": "not-an-email", "name": "A", "role": "viewer"},
                     {"ward_id": WARD, "email": "a@b.pt", "name": "", "role": "viewer"},
                     {"ward_id": WARD, "email": "a@b.pt", "name": "A", "role": "owner"}):
            with self.assertRaises(server.ApiError):
                server.validate_create(body)

    def test_reset_needs_two_uuids(self):
        with self.assertRaises(server.ApiError):
            server.validate_reset({"ward_id": WARD, "user_id": "nope"})


class TestPassword(unittest.TestCase):
    def test_shape_and_alphabet(self):
        p = server.temp_password()
        self.assertRegex(p, r"^Agenda-[a-z2-9]{4}-[a-z2-9]{4}$")
        self.assertFalse(set(p[7:].replace("-", "")) & set("01ilo"))

    def test_random(self):
        self.assertEqual(len({server.temp_password() for _ in range(50)}), 50)


if __name__ == "__main__":
    unittest.main()
