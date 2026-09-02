

### Tender Dashboard – Filtering & Delay Enhancements

1. **Analyze the Existing Tender Dashboard**

   * Analyze the complete existing Tender Dashboard implementation, including frontend, backend, database structure, existing filters, project-stage blocks, and table functionality.
   * Implement the following changes without affecting any existing functionality, project data, responsiveness, or UI behavior.

2. **Add Filters After Selecting a Project Stage**

   * In the **Tender Dashboard → Dashboard** section, when the user clicks any project-stage block, the corresponding project list/table is displayed.
   * Add the following four dropdown filters above the displayed project table:

     * **Execution Status**
     * **Division**
     * **Scheme**
     * **Sector**
   * Each dropdown should provide relevant values from the existing project data.
   * Selecting a value should filter the displayed project list accordingly.
   * The filters should work together, meaning multiple filters can be applied simultaneously.
   * Include an option such as **All** in each dropdown to remove that particular filter.

3. **Add Delay Filter**

   * Add a filter to the **Delay** column in the Tender Dashboard project table.
   * The Delay filter should provide checkbox/tick-mark options for:

     * **> 15 Days**
     * **> 30 Days**
     * **> 60 Days**
     * **> 90 Days**
     * **More than 90 Days**
   * Users should be able to select one or multiple delay options.
   * The table should update based on the selected delay criteria.
   * Ensure the delay filtering logic is consistent and does not produce duplicate or incorrect results.

4. **Add Dummy Delayed Data to the Database**

   * Add appropriate dummy project records to the database for testing the delay functionality.
   * The dummy records should contain different delay durations so that all delay filter conditions can be properly tested, including:

     * Projects delayed by more than 15 days
     * Projects delayed by more than 30 days
     * Projects delayed by more than 60 days
     * Projects delayed by more than 90 days
   * Ensure the dummy data is integrated into the existing database structure and does not overwrite or modify existing production/project data unnecessarily.
   * Ensure the Delay value is correctly calculated and displayed in the Tender Dashboard.

5. **Add Filters to All Applicable Table Columns**

   * Add filtering functionality to **every applicable column** of the Tender Dashboard project table.
   * Each column filter should be appropriate to its data type.
   * Examples:

     * Text-based columns → text/search filter
     * Division → dropdown filter
     * Date columns → appropriate date filter
     * Status/stage columns → dropdown filter
     * Delay → predefined delay filter
   * Filters should work independently and in combination with each other.

6. **Ensure Combined Filtering**

   * The following filters must be capable of working simultaneously:

     * Execution Status
     * Division
     * Scheme
     * Sector
     * Delay
     * Individual table-column filters
   * When multiple filters are applied, display only records satisfying **all active filter conditions**.
   * Clearing one filter should remove only that filter's condition while keeping the remaining filters active.
   * Provide a **Clear/Reset Filters** option to remove all applied filters.

7. **Maintain Existing Functionality**

   * Do not break or modify unrelated existing functionality.
   * Existing project-stage blocks must continue to work correctly.
   * Clicking a project-stage block must continue to display the correct corresponding projects.
   * Existing project details, navigation, sorting, pagination, responsiveness, and other Tender Dashboard functionality must remain intact unless changes are specifically required for the new filtering functionality.

8. **Frontend, Backend & Database Validation**

   * Ensure the filtering logic is correctly implemented across the required frontend/backend layers.
   * Verify that filters return accurate results from the database.
   * Avoid unnecessary duplicate API calls or inefficient database queries.
   * Ensure the implementation works correctly with existing and newly added dummy data.

9. **Testing Requirements**

   * Test every newly added filter individually.
   * Test combinations of multiple filters.
   * Test the Delay filter against all delay categories.
   * Test clearing individual filters and clearing all filters.
   * Verify that clicking each project-stage block continues to show the correct projects.
   * Verify that existing functionality and responsive behavior remain unaffected.
