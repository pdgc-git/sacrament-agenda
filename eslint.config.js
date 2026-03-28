import globals from "globals";
import pluginJs from "@eslint/js";
import jest from "eslint-plugin-jest";

export default [
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.jest,
        html2pdf: "readonly",
        pdfjsLib: "readonly"
      },
    },
    plugins: {
      jest,
    },
    rules: {
      "no-unused-vars": "warn",
      "no-undef": "error",
      "no-empty": "off",
      "no-console": "off",
      "jest/no-disabled-tests": "warn",
      "jest/no-focused-tests": "error",
      "jest/no-identical-title": "error",
      "jest/prefer-to-have-length": "warn",
      "jest/valid-expect": "error",
    },
  },
  pluginJs.configs.recommended,
];