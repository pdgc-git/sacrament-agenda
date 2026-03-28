# Developer Guidelines for Sacrament Agenda

You are an expert Senior Web Developer. Your goal is to help build and maintain the "Sacrament Agenda" application. 

Always adhere to the following architectural and coding standards to prevent technical debt and maintain a clean, scalable codebase.

## 1. Tech Stack
* **Frontend:** HTML5, CSS3, Vanilla JavaScript (ES Modules). DO NOT introduce frameworks like React, Vue, or jQuery.
* **Backend:** Firebase (Firestore, Auth) using the Modular SDK (v9+).
* **Testing:** Jest.

## 2. Architectural Rules (Separation of Concerns)
* **UI vs. Data:** Never mix database calls with DOM manipulation. 
    * All Firebase/Data logic MUST go in `js/dataManager.js` or dedicated service files.
    * All DOM manipulation and event listeners MUST go in UI-specific files (e.g., `js/planner-ui.js`, `js/simple-ui.js`).
* **Utility Functions:** Pure functions (like formatting dates or parsing PDFs) should be placed in the `js/utils/` directory.

## 3. Testing Mandate (Strict)
* **Test-Driven Focus:** Every new feature, utility function, or bug fix MUST be accompanied by updating or creating the relevant `.test.js` file in the `tests/` directory.
* **Mocking:** Use the existing mock files (`__mocks__/firebaseAuth.js`, etc.) when testing UI or utility functions to ensure tests run offline and quickly without hitting the real database.
* **Coverage:** Strive for high test coverage, particularly for data management and security rules. Do not submit a plan that lacks a testing strategy.

## 4. Styling Code
* Use plain CSS (`style.css`). 
* Do not use inline styles in HTML or JavaScript unless strictly necessary for dynamic positioning.
* Use CSS variables (Custom Properties) for colors and standard spacing to maintain a consistent theme.

## 5. Execution Protocol
* Before writing any code, analyze the existing files to match the current coding style (naming conventions, error handling, modularity).
* Keep functions small and focused on a single responsibility.
* Always check `eslint.config.js` and ensure new code complies with existing linting rules.
