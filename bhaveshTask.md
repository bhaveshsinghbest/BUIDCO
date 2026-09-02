### Reframed Tasks – Funding Source & UC Funds

1. **Analyze the Complete Project**

   * Analyze the entire existing project, including frontend, backend, database, APIs, project creation flow, project details pages, and MD Portfolio.
   * Implement all the changes below without affecting existing functionality, responsiveness, existing projects, or other modules.

2. **Update Funding Source – Central/State Share**

   * In the **Input Sheet → Funding Source of the Project**, update the **Central-State Share** dropdown/input functionality.
   * When **Central-State Share** is selected, the **Central Share** and **State Share** fields must be entered/displayed as **percentages (%)**, not in **Crores**.
   * Update the frontend labels, input fields, validation, calculations, and display wherever required.
   * Update the **database structure and stored data** accordingly so that Central Share and State Share are stored as percentages.
   * Ensure existing funding-source functionality and other funding-source options continue to work correctly.
   * Verify that the total Central Share + State Share is handled correctly according to the existing project logic.

3. **Fix UC Funds Not Showing in Project Details**

   * In the **Input Sheet**, when a project is created by entering all required details, including **UC Funds details**, ensure the UC Funds information is successfully saved.
   * Currently, after creating a project, the **UC Funds details are not displayed** when opening the individual project.
   * Fix the complete data flow so that UC Funds entered during project creation are:

     * Saved correctly in the database.
     * Retrieved correctly through the required APIs.
     * Displayed correctly in the individual **Project Details** section.
   * Ensure UC Funds are displayed for both newly created projects and existing projects where UC Funds data is available.

4. **Fix UC Funds in MD Portfolio**

   * When a user opens a project through the **MD Portfolio** and views the individual project details, the **UC Funds details must also be displayed**.
   * Ensure the same UC Funds data is consistently available in:

     * Input Sheet
     * Individual Project Details
     * MD Portfolio → Individual Project Details
     * Any other existing project-detail views where project financial/funding information is displayed.

5. **Audit UC Funds Throughout the Entire Project**

   * Since the **UC Funds section was recently added**, perform a complete audit of the application to identify every location where individual project details are displayed.
   * Check whether **UC Funds details are available and correctly displayed** in every relevant project-detail section, page, modal, dashboard, portfolio, API response, and related component.
   * Wherever UC Funds are missing, update the implementation so the information is consistently available.
   * Do not create duplicate UC Funds fields or duplicate data storage.

6. **Database & Existing Project Data**

   * Verify that the database contains the required UC Funds fields/tables/relationships.
   * Ensure the database changes are backward-compatible with existing projects.
   * Do not delete, overwrite, or corrupt existing project data.
   * Where required, update existing records/migrations so that previously created projects can also correctly display their available UC Funds information.

7. **End-to-End Validation**

   * Create a test project through the Input Sheet with complete Funding Source and UC Funds details.
   * Verify that:

     * Central/State Share is stored and displayed in **%**.
     * UC Funds are saved successfully.
     * UC Funds appear in the individual Project Details page.
     * UC Funds appear in MD Portfolio → Project Details.
     * UC Funds appear in all other applicable project-detail sections.
   * Verify existing projects and all unrelated functionality continue to work correctly.
   * Ensure the entire application remains **responsive** across supported screen sizes.
