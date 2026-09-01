import { Route, Routes } from 'react-router-dom';
import { ProtectedRoute } from './components/auth/ProtectedRoute';
import { RoleGuardedRoute } from './components/auth/RoleGate';
import { AppShell } from './components/layout/AppShell';
import { AuditTrailPage } from './pages/AuditTrailPage';
import { CosEotPage } from './pages/CosEotPage';
import { DistrictsPage } from './pages/DistrictsPage';
import { DivisionsPage } from './pages/DivisionsPage';
import { ForgotPasswordPage } from './pages/ForgotPasswordPage';
import { FundsUcPage } from './pages/FundsUcPage';
import { InputSheetPage } from './pages/InputSheetPage';
import { LoginPage } from './pages/LoginPage';
import { MgmtActionsPage } from './pages/MgmtActionsPage';
import { MoMPage } from './pages/MoMPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { OmPage } from './pages/OmPage';
import { OutstandingGapsPage } from './pages/OutstandingGapsPage';
import { OverviewPage } from './pages/OverviewPage';
import { PlaceholderPage } from './pages/PlaceholderPage';
import { PreMonsoonPage } from './pages/PreMonsoonPage';
import { ProjectDetailPage } from './pages/ProjectDetailPage';
import { ProjectsPage } from './pages/ProjectsPage';
import { SchemesPage } from './pages/SchemesPage';
import { SectorsPage } from './pages/SectorsPage';
import { UserManagementPage } from './pages/UserManagementPage';

export function AppRoutes(): JSX.Element {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />

      <Route element={<ProtectedRoute />}>
        <Route element={<AppShell />}>
          <Route index element={<OverviewPage />} />

          {/* Primary tabs */}
          <Route path="schemes" element={<SchemesPage />} />
          <Route path="sectors" element={<SectorsPage />} />
          <Route path="districts" element={<DistrictsPage />} />
          <Route path="divisions" element={<DivisionsPage />} />

          {/* Projects — 6.3 */}
          <Route path="projects" element={<ProjectsPage />} />
          <Route path="projects/:projectId" element={<ProjectDetailPage />} />

          {/* Input Sheet — 6.4 (RBAC gated inside the page) */}
          <Route path="input-sheet" element={<InputSheetPage />} />
          <Route path="input-sheet/:projectId" element={<InputSheetPage />} />

          {/* Domain lists — 6.5 */}
          <Route path="cos-eot" element={<CosEotPage />} />
          <Route path="management-actions" element={<MgmtActionsPage />} />
          <Route path="gaps" element={<OutstandingGapsPage />} />
          <Route path="pre-monsoon" element={<PreMonsoonPage />} />
          <Route path="funds-uc" element={<FundsUcPage />} />
          <Route path="mom" element={<MoMPage />} />
          {/* Photos view deferred to end of Phase 6 */}
          <Route path="photos" element={<PlaceholderPage title="Geo Photos" subBatch="deferred" />} />
          <Route path="om" element={<OmPage />} />

          {/* 6.6 — Audit trail is MD + Admin only; user management is MD + Admin + PD (PD scope is Viewer-only delete, enforced in-page + backend). */}
          <Route
            path="audit"
            element={
              <RoleGuardedRoute allow={['MD', 'Admin']}>
                <AuditTrailPage />
              </RoleGuardedRoute>
            }
          />
          <Route
            path="users"
            element={
              <RoleGuardedRoute allow={['MD', 'Admin', 'PD']}>
                <UserManagementPage />
              </RoleGuardedRoute>
            }
          />

          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Route>
    </Routes>
  );
}
