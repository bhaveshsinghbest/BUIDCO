Analyze the Complete Project & Implement Changes Safely
Analyze the complete project structure, architecture, components, routing, APIs, database/data flow, and existing functionality.
Implement all requested changes without affecting existing features or workflows.
Maintain the current project structure and coding patterns wherever possible.
Ensure all existing functionality continues to work correctly.
Maintain full responsiveness across desktop, tablet, and mobile devices.
Avoid unnecessary changes to unrelated modules/components.
Fix Block-Level Buttons in Funds & UC
In the Funds & UC section, identify why the block-level buttons are currently not clickable.
Make all applicable block-level buttons functional/clickable.
Ensure the fix does not affect other buttons, navigation, or existing functionality.
Verify proper hover, active, and disabled states where applicable.
Remove Unwanted Description Line

In the Funds & UC section, remove the following line:

EAP / Non-EAP / State Share / State Funded — as filed in the GFR 12-A ledger.

Ensure removal does not create unwanted spacing or layout issues.
Add Dummy Data to Funds & UC Tables
Add realistic dummy/sample data to the By Funding Source table.
Add realistic dummy/sample data to the UC Ledger — by Project (2 of 11) table.
Ensure the dummy data follows the existing table structure, formatting, calculations, and UI patterns.
Use sufficient data to properly demonstrate how the tables will look and function with actual project records.
Do not replace or alter the existing table functionality.
Add “Funding Source of the Project” Field to Input Sheet
In the Input Sheet, where project details are entered, add a new field:
Funding Source of the Project
Implement it as a dropdown with the following four options:
Central - EAP
Central - Non-EAP
Central - State Share
State Funded
Add Share Inputs Based on Funding Source
When a funding source is selected, display the relevant share input fields.
Provide inputs for entering the respective share amounts/percentages for the selected funding source.
The user should be able to manually enter the share values.
Clearly label the inputs so it is obvious which share belongs to which funding component.
Add appropriate validation for the share inputs.
Ensure the share values are correctly stored with the project details and available wherever project funding information is subsequently displayed or used.
Connect Funding Source with Funds & UC
Ensure the funding source entered in the Input Sheet is reflected correctly in the Funds & UC section.
The selected category should map correctly to:
Central - EAP
Central - Non-EAP
Central - State Share
State Funded
Ensure the corresponding share information is available for the By Funding Source and UC Ledger — by Project views where applicable.
Testing & Regression Check
Test the complete project after implementation.
Verify:
Existing dashboard functionality.
Existing sidebar sections.
Funds & UC navigation.
Block-level buttons.
Input Sheet project creation/editing.
Funding source dropdown.
Share inputs and validation.
Funds & UC tables.
Responsive behavior.
Confirm there are no broken routes, console errors, UI regressions, or unintended changes to other project modules.