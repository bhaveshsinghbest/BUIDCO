# Application Testing & Audit Documentation – Test Scenarios

## 0. Testing Safety, Data Protection & Cleanup Requirements

All testing must be performed in a **controlled manner without affecting, modifying, or compromising the existing application, existing project data, configurations, or live functionality**.

### Testing Safety Requirements

* Do not modify, delete, overwrite, or corrupt any existing production/actual project data.
* Use **test/dummy data** wherever new records are required for testing.
* Do not perform destructive operations on existing records unless specifically required for the test and a safe test record is being used.
* Ensure that testing activities do not impact existing users, workflows, dashboards, KPIs, reports, or application functionality.
* Before performing any CRUD, import, expiry, or project-creation test, ensure that the test data/records can be clearly identified as testing data.
* Take the required **Before** screenshots before making any changes.
* Take the required **After** screenshots immediately after completing the test.
* Highlight the exact changes in the screenshots for audit evidence.
* Verify that existing application data remains unaffected after testing.

### Testing Data Cleanup

After all testing activities and the final **Word testing/audit document** have been prepared and verified:

1. Identify all **test files, dummy Excel files, temporary documents, screenshots, exported files, and other temporary testing artifacts created during the current testing session**.
2. Remove/delete these temporary testing files after confirming that the required screenshots and evidence have been incorporated into the final Word document.
3. Remove any temporary test records/data created specifically for testing, wherever applicable and safe to do so.
4. **Do not delete or modify any existing/production application data.**
5. Ensure that the application is left in the same valid operational state as before testing, except for documented permanent changes that are part of the approved application functionality.
6. Verify that the final Word document contains all required screenshots and evidence **before deleting the temporary testing artifacts**.
7. Retain only the final approved testing/audit documentation and any files specifically required for official records.

> **Important:** The cleanup process must be performed carefully so that only files and data created specifically for the current testing activity are removed. Existing application files, production data, source code, configuration files, and genuine project records must not be deleted.

---

# Scenario 1: Create New Projects Through Input Sheet

### Objective

Verify that new projects can be successfully created through the **Input Sheet** and that all relevant dashboard/project statistics are updated correctly.

### Tasks

1. Capture screenshots of the application **before creating the projects**.
2. Record the existing values for:

   * Total Projects
   * Completed Projects
   * In Progress Projects
   * Not Started Projects
   * Delayed Projects
   * On Hold Projects
   * Other applicable KPIs/status counts
3. Create **3 test projects** through the Input Sheet using dummy/test data.
4. Capture screenshots during/after the project creation process.
5. Verify that the newly created projects are displayed correctly in the Project section.
6. Verify that the relevant KPIs and project-status counts are updated.
7. Capture **after-creation screenshots**.
8. Highlight all changes between the Before and After screenshots.
9. Document the expected result, actual result, and testing status.
10. After completion of the overall testing and documentation, remove the temporary test projects if they were created solely for testing and can be safely removed.

### Evidence Required

* Before project creation screenshot
* Input Sheet data-entry screenshot
* After project creation screenshot
* Updated Project section screenshot
* Updated KPI/dashboard screenshot
* Highlighted Before vs. After comparison

---

# Scenario 2: CRUD Testing for Existing Projects

### Objective

Verify that existing projects support the required **Create, Read, Update, and Delete (CRUD)** operations without affecting genuine application data.

### Tasks

1. Select an appropriate **test project/record** for CRUD testing.
2. Capture the **Before** screenshot showing the existing project details.
3. Perform the applicable CRUD operations:

   * **Create:** Create a test project, where applicable.
   * **Read:** View and verify project information.
   * **Update:** Modify selected test-project information.
   * **Delete:** Delete the test project, where permitted.
4. Capture screenshots before and after each relevant operation.
5. Verify that updated information is correctly reflected throughout the application.
6. Verify that deleted test records are removed correctly.
7. Highlight the changes made in the screenshots.
8. Document expected result, actual result, and testing status.
9. Ensure that no genuine/production project is unintentionally modified or deleted.

---

# Scenario 3: O&M and PBG Expiry Testing

### Objective

Verify the application's handling of **O&M and PBG expiry conditions**, including the application's behavior before and after expiry.

### Tasks

1. Use a suitable test project with O&M and PBG expiry information.
2. Capture the project status **before expiry**.
3. Test the condition where the O&M/PBG is **1 day before expiry**.
4. Capture the screenshot showing the application state one day before expiry.
5. Verify:

   * Expiry status
   * Alerts/notifications
   * Project indicators
   * Dashboard/KPI changes
   * Expiry-related remarks/highlighting
6. Test the state **after the expiry date**.
7. Capture the **After Expiry** screenshot.
8. Compare the Before and After states.
9. Highlight all changes in the screenshots.
10. Document expected result, actual result, and testing status.
11. Ensure that the testing does not alter genuine project expiry information.

---

# Scenario 4: Import Projects Through Excel Sheet

### Objective

Verify that projects can be successfully imported through an **Excel file** and correctly reflected in the application's Project section.

### Tasks

1. Prepare an Excel sheet containing **dummy/test project data**.
2. Capture a screenshot of the Excel sheet showing the project records to be imported.
3. Capture the application state **before importing** the Excel file.
4. Import the Excel file into the application.
5. Verify successful processing/import of the records.
6. Navigate to the Project section.
7. Verify that the imported projects are displayed correctly.
8. Verify relevant project details and dashboard/KPI counts.
9. Capture screenshots **after the import**.
10. Highlight the newly imported projects and any KPI/status changes.
11. Compare the Excel input data with the records displayed in the application.
12. Document expected result, actual result, and testing status.
13. After the Word document is finalized, remove the temporary Excel test file and test records, provided they were created solely for this testing activity.

---

# Standard Documentation Format

Each test scenario should follow the same audit-friendly structure:

1. **Test Case ID**
2. **Test Scenario**
3. **Objective**
4. **Pre-Conditions**
5. **Test Data**
6. **Steps Performed**
7. **Before Testing – Screenshot**
8. **Action/Change Performed**
9. **After Testing – Screenshot**
10. **Highlighted Changes**
11. **Expected Result**
12. **Actual Result**
13. **Test Status – Pass/Fail**
14. **Remarks/Observations**
15. **Cleanup Confirmation**

### Screenshot Requirements

For every screenshot:

* Clearly highlight the **specific field, project, KPI, status, alert, or record that changed**.
* Use consistent highlighting/annotations.
* Include relevant dates/timestamps wherever applicable.
* Ensure screenshots are clear and readable.
* Show **Before → Action → After** wherever applicable.
* For import testing, show **Excel Source → Application Result**.
* For expiry testing, show **Before Expiry → 1 Day Before Expiry → After Expiry**.
* For CRUD testing, show the relevant **Before → Operation → After** state.

### Final Audit Evidence

The completed Word document should provide sufficient evidence that:

* The application was tested using defined functional scenarios.
* Testing was performed using controlled/test data.
* Existing application data and functionality were protected.
* Changes were verified through Before and After screenshots.
* Relevant KPIs, project statuses, CRUD operations, expiry conditions, and import functionality were tested.
* All significant changes were highlighted.
* Temporary testing artifacts were cleaned up after the documentation was completed.
* Existing/production application data was not unintentionally affected.
