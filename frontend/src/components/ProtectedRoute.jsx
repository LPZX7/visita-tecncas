import { Navigate } from 'react-router-dom';
import { getUser } from '../utils/auth';

export default function ProtectedRoute({ allowedRoles, children }) {
  const user = getUser();
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to="/dashboard" replace />;
  }
  return children;
}
