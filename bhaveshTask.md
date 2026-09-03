### Tasks – Project Deployment & Data Analysis

1. **Analyze the Complete Project**

   * Review the entire codebase, including frontend, backend, database configuration, environment variables, APIs, and deployment configuration.
   * Understand how the frontend, backend, and database are currently connected.
   * Do not make any changes that affect existing functionality, responsiveness, UI, or project workflows.

2. **Analyze the Current Database & Dummy Data**

   * Identify where all currently used dummy/test data is stored.
   * Determine whether the dummy data is stored in:

     * Neon/PostgreSQL database
     * Local database
     * JSON/static files
     * Frontend/local storage
     * Backend seed files
     * Any other location
   * Identify the database tables currently being used by the application.
   * Clearly explain where the data will be stored after deployment to Vercel.
   * Do not delete or modify existing data during this analysis.

3. **Analyze the Current Render & Neon Dependency**

   * Identify all places in the project that depend on the previous owner's Render account or Neon account.
   * Identify all Render URLs, Neon database connections, environment variables, API endpoints, and deployment configurations associated with those accounts.
   * Clearly explain what needs to be replaced because I do not have access to my friend's Render or Neon accounts.

4. **Prepare the Project for Vercel**

   * Analyze whether the current project can be deployed directly to Vercel.
   * Identify any frontend/backend architecture issues that could prevent deployment.
   * Determine whether the backend needs to be modified for Vercel deployment.
   * Make only the minimum required changes for deployment.
   * Do not break any existing functionality.

5. **GitHub → Vercel Deployment**

   * Guide me step-by-step on how to deploy this project from my GitHub repository to Vercel.
   * Assume that I am a complete beginner.
   * Explain every step in simple language, including:

     1. What needs to be checked in GitHub.
     2. How to connect GitHub to Vercel.
     3. Which repository and branch to select.
     4. Which project/root directory to select.
     5. What Build Command, Output Directory, and Install Command should be used, if applicable.
     6. Which environment variables need to be added.
     7. Where each environment variable comes from.
     8. How to create replacement services/accounts if the current Render/Neon accounts cannot be used.
     9. How to deploy.
     10. How to verify that the deployed application is working correctly.

6. **Database Replacement**

   * Since I do not have access to my friend's Neon account, determine whether I need to create my own PostgreSQL/Neon database or use another suitable database service.
   * Explain how to create and configure my own database as a beginner.
   * Explain how to obtain the required database connection string.
   * Explain how to configure the project to use the new database.
   * Explain how to run the required database migrations safely.
   * Do not delete the existing schema or data unless explicitly instructed.

7. **Data Migration / Dummy Data**

   * Determine whether the current dummy data can be migrated to my new database.
   * Identify the seed files, scripts, migrations, or other mechanisms used to populate the dummy data.
   * Explain exactly how the existing dummy data can be recreated or migrated into the new database.
   * Clearly distinguish between:

     * Database schema
     * Dummy/seed data
     * User-created data
     * Static frontend data

8. **Deployment Verification**

   * After deployment, test the Vercel application end-to-end.
   * Verify frontend pages, backend/API connectivity, database connectivity, authentication, CRUD operations, and major workflows.
   * Check browser console and deployment logs for errors.
   * Verify that data is being saved and retrieved from the intended database.
   * Verify that the application remains responsive on desktop and mobile.

9. **Beginner-Friendly Final Guide**

   * Do not assume that I understand Vercel, Render, Neon, GitHub, databases, environment variables, or deployment.
   * Explain each step in simple terms.
   * For every command I need to run, provide the exact command and explain where I need to run it.
   * Clearly tell me when I need to:

     * Click something in Vercel
     * Change something in GitHub
     * Create a database
     * Add an environment variable
     * Run a terminal command
     * Commit/push code
   * If something cannot be determined from the codebase, explicitly tell me what information is missing instead of guessing.

10. **Final Deliverables**

* Provide:

  * Complete project architecture summary
  * Current deployment architecture
  * Current dummy-data storage location
  * Current database details
  * Render dependencies
  * Neon dependencies
  * Required code changes
  * Required environment variables
  * Vercel deployment steps
  * Database setup steps
  * Migration/seed-data steps
  * Post-deployment testing checklist
  * Any risks or issues that must be resolved before production

**Important:** Do not deploy, delete databases, change production data, or perform destructive operations without asking for my explicit confirmation first. Since I am a beginner, guide me one step at a time and wait for my confirmation before proceeding to any step that could affect data or production.
