import js from "@eslint/js";
import globals from "globals";
import prettier from "eslint-config-prettier";
import jsdoc from "eslint-plugin-jsdoc";

export default [
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.node,
        ...globals.es2021
      }
    },
    rules: {
      "no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_"
        }
      ],
      "no-const-assign": "error",
      "no-debugger": "error",
      "no-unreachable": "error",
      curly: ["error", "all"],
      eqeqeq: ["error", "always"],
      "guard-for-in": "error",
      "no-empty": "error",
      "no-eval": "error",
      "no-floating-decimal": "error",
      "no-new-wrappers": "error",
      "no-param-reassign": "error",
      "no-proto": "error",
      "no-script-url": "error",
      "no-throw-literal": "error",
      "no-useless-call": "error",
      "no-useless-concat": "error",
      "no-void": "error",
      "no-with": "error",
      "prefer-const": "error",
      strict: ["error", "global"],
      yoda: "error"
    }
  },
  prettier,
  {
    files: ["packages/*/src/**/*.js"],
    plugins: { jsdoc },
    rules: {
      "jsdoc/require-jsdoc": [
        "error",
        {
          publicOnly: true,
          require: {
            FunctionDeclaration: true,
            MethodDefinition: true,
            ClassDeclaration: true
          },
          checkConstructors: false,
          checkGetters: false
        }
      ],
      "jsdoc/require-param": ["error", { checkConstructors: false }],
      "jsdoc/require-returns": ["error", { checkConstructors: false }]
    }
  }
];
