Phase 1 – Critical Security Fixes

S-01 – Rotate Exposed Credentials and Secure Git History

Rotate the leaked Upstash Redis token.

Change the exposed database password.

Verify that production JWT secrets are different from previously leaked secrets.

Identify all locations where exposed credentials may exist, including source code, configuration files and Git history.

Review and decide whether Git history needs to be purged.

Ensure all credentials are stored securely using environment variables or an approved secrets-management solution.

S-02 – Remove and Secure Demo Accounts

Check all live databases for accounts matching the demo_* pattern.

Disable or remove unauthorized demo accounts.

Move demo passwords from seed files and test files into environment variables.

Ensure demo credentials cannot be used in the production environment.

Phase 2 – High-Priority Security Fixes

S-03 – Correct Role-Based Access Control (RBAC) Permissions

Review the existing "Can View Projects" permission.

Identify all modules and pages controlled by this permission, including Projects, Dashboard, Funds and MoM.

Ensure unauthorized users cannot access restricted pages through direct URLs or API requests.

Maintain consistent permission enforcement across frontend routes and backend APIs.

S-04 – Secure Mobile OTP Authentication

Integrate an authorized SMS gateway for mobile OTP delivery or remove the mobile OTP option if an SMS gateway is not approved.

Ensure OTP values are never exposed in application logs, console output or error messages.

Secure OTP generation, validation, expiration and attempt tracking.

S-05 – Enforce NODE_ENV Configuration

Modify the backend application to refuse startup when NODE_ENV is missing.

Remove unsafe default environment configurations.

Update local development, testing and E2E test configurations to provide the required environment variable explicitly.

S-06 – Fix Dependency Vulnerabilities

Run npm audit in both frontend and backend applications.

Apply non-breaking security fixes using npm audit fix.

Review critical and high-severity dependency vulnerabilities.

Avoid introducing breaking dependency upgrades without compatibility testing.

Re-run application tests and verify that existing functionality remains unaffected.

S-07 – Remove Frontend Source Maps from Production Build

Configure the production build to disable source-map generation.

Remove previously generated source maps from frontend/dist/.

Generate a fresh production build.

Verify that no .map files are included in the final deployment package.

S-08 – Review Confidential Documents and GitHub Repository Exposure

Identify PDF and Word reports committed to Git.

Get an authorized BUIDCo/UDHD officer to review whether these documents contain confidential information.

Verify whether the GitHub repository is public or private.

Remove unauthorized confidential documents from the repository and ensure sensitive historical content is appropriately addressed.

S-09 – Review OneDrive Storage Security

Review whether storing the project and its associated documents in OneDrive is permitted under departmental security policy.- it can be done only by MD

Verify access permissions and sharing configurations.

Ensure confidential government project information is not accessible through unauthorized sharing links.

S-10 – Implement Database TLS Certificate Verification

Configure database connections to validate TLS certificates.

Ensure insecure certificate-validation bypasses are not used in production.

Verify secure database connectivity in the government hosting environment.

S-11 – Implement Application Logging and Centralized Log Management

Implement logging for application page requests.

Implement logging for successful and unsuccessful login events.

Ensure sensitive information, including passwords, OTPs, JWT tokens and database credentials, is never recorded in logs.

Integrate centralized logging.

Configure log retention for 180 days, subject to the department's approved policy.

Verify that production logs do not expose internal server paths, database details or confidential information.

Phase 3 – Medium-Priority Security and Application Fixes

S-14 – Implement Login Rate Limiting

Implement per-IP login rate limiting.

Configure appropriate request thresholds and blocking periods.

Decide and configure the storage mechanism for rate-limit data.

Ensure rate limiting works correctly across multiple application instances.

S-15 – Configure Login Session Expiration

Define the approved login session duration.

Configure session and token expiration accordingly.

Implement secure session termination and invalidation.

Verify that expired sessions cannot access protected application modules.

S-20 – Exclude Demo Data from Production

Identify all demo-data scripts and seed files.

Prevent demo-data scripts from being included in the production build.

Ensure demo data cannot accidentally be inserted into the production database.

Verify production database initialization and deployment procedures.

S-21 – Restrict Project Photo Uploads

Restrict photo uploads so that a PD can upload and access photographs belonging only to their authorized division.

Enforce division-level access validation on the backend.

Prevent unauthorized access to photographs through direct API requests or URLs.

Finalize and configure the approved photo-storage location.

Implement secure upload validation, file-type restrictions and file-size limits.

S-22 – Configure Reverse Proxy Trust

Review the production network architecture and number of reverse proxies in front of the backend API.

Configure the Express trust proxy setting according to the actual infrastructure.

Verify that client IP addresses are identified correctly.

Ensure forwarded headers cannot be manipulated to bypass IP-based security controls.

Phase 4 – Low-Priority Security Fixes and Repository Cleanup

S-23 – Remove Unused Screenshots

Identify unused screenshots in the project repository.

Verify that they are not required for documentation or application functionality.

Remove approved unnecessary screenshots from the tracked repository.

S-24 – Remove Ad-Hoc Test Scripts

Identify temporary and ad-hoc testing scripts.

Verify that required automated tests are retained.

Remove approved unnecessary test scripts from the repository.

S-25 – Remove Outdated Internal Notes

Identify outdated notes and temporary documentation.

Review references to internal government documents and confidential information.

Remove approved unnecessary notes from the tracked repository.

S-26 – Review Translation Fallback Configuration

Review the existing translation fallback implementation.

Keep translation fallback disabled unless an authorized decision is made.

Alternatively, obtain departmental approval for Bhashini integration.

Ensure translation services do not expose confidential government data to unauthorized third-party services.

S-27 – Fix Concurrent OTP Attempt Counter

Correct the OTP attempt-counter implementation.

Ensure parallel OTP verification requests cannot bypass the configured attempt limit.

Implement atomic or concurrency-safe counter updates.

Test simultaneous OTP verification attempts.

S-28 – Implement Logout Request Validation

Add the same request validation mechanism to the logout endpoint that is already implemented for the refresh endpoint.

Verify proper authentication and request validation.

Ensure unauthorized or malformed logout requests are handled securely.

S-30 – Review Contractor Names in Demo Data

Identify realistic contractor names used in demonstration data.

Verify whether the names correspond to actual contractors.

Obtain approval to retain them or replace them with fictional demonstration names.

Ensure demonstration data cannot be mistaken for actual government records.

S-31 – Restrict Officials' Contact Information

Define which user roles are authorized to view other officials' email addresses and mobile numbers.

Implement appropriate field-level access restrictions.

Enforce the restrictions through backend APIs, not only frontend visibility.

Verify that unauthorized users cannot retrieve restricted contact information.

S-32 – Remove Fallback Password from Load Testing

Identify the fallback password in the load-testing script.

Remove hardcoded fallback credentials.

Use environment-based test credentials.

Ensure load-testing credentials cannot be used for production authentication.

Phase 5 – Code Quality and Project Cleanup

Q-01 – Fix Broken NPM Script

Identify the broken npm script.

Correct its command and configuration.

Verify that it executes successfully.

Q-02 – Remove or Complete Placeholder Photos Page

Review the existing /photos page.

Determine whether the page is required for the application.

Implement the complete intended functionality or remove the unused placeholder page.

Ensure no broken routes or navigation links remain.

Q-03 – Add Missing Favicon

Add the appropriate application favicon.

Configure the favicon path correctly.

Verify its visibility in supported browsers.

Q-04 – Remove Dead Code

Identify unused functions, components, variables, imports and obsolete implementations.

Remove unnecessary code without affecting existing functionality.

Run application tests after cleanup.

Q-05 – Review and Optimize Large Files

Identify unnecessarily large files in the repository.

Review their purpose and usage.

Optimize or split files where appropriate without affecting application functionality.

Q-06 – Verify Missing Database Migration

Inform the database administrator that migration 0018 is intentionally missing.

Document the reason for its absence.

Ensure migration history and database schema remain consistent.

Do not recreate or apply the migration without authorization.

Q-07 – Review Internal Document References

Identify source-code comments referring to internal government documents.

Review whether these references are necessary.

Remove confidential internal references where appropriate.

Retain useful technical documentation that does not expose confidential information.

Q-08 – Remove Unused NPM Packages

Identify unused dependencies in frontend and backend applications.

Verify that packages are not required indirectly or dynamically.

Remove unnecessary dependencies.

Update lock files and verify successful builds and tests.

Phase 6 – Final Security Verification and Government Deployment Readiness

Perform Complete Security Re-Scanning

Re-scan the entire frontend and backend codebase.

Verify that all identified credentials, tokens, passwords and sensitive values have been secured.

Recheck dependency vulnerabilities, authentication, authorization, APIs, database security, file uploads and logging.

Verify that previously identified audit findings have been addressed.

Perform Complete Functional and Regression Testing

Test all existing modules, dashboards, project workflows, funds, MoM, tenders, reports and administrative functions.

Test all authorized user roles and their access permissions.

Verify that security changes have not affected existing business logic or application functionality.

Test responsive layouts across desktop, tablet and mobile devices.

Prepare Final Government Production Deployment Package

Generate a clean production build.

Verify that source maps, demo scripts, temporary files, development configurations and sensitive credentials are not included.

Verify production environment variables and secure database connectivity.

Prepare deployment documentation and configuration requirements.

Obtain the final security audit clearance and hosting approval before production deployment.

Important Implementation Instructions

Analyze the complete project before implementing changes.

Follow the existing project architecture and coding standards.

Do not modify unrelated functionality or redesign existing UI components.

Do not delete files without verifying their purpose and obtaining approval where required.

Do not expose actual credentials or sensitive information in reports.

Maintain separate development, testing and production configurations.

Perform regression testing after each implementation phase.

Maintain a backup and document every modification.

Do not deploy the application or connect to live government infrastructure without explicit authorization.

Track every finding using its original S-ID or Q-ID and update its status only after verification.

Final Objective: Resolve all applicable pending security audit findings, maintain existing BUIDCo Dashboard functionality, prepare the application for independent security verification, and make it ready for deployment on the authorized government hosting infrastructure.