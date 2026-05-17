import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import type { ReactNode } from "react";
import { useAuth } from "@/providers/AuthProvider";

import Login from "@/pages/Login";
import Signup from "@/pages/Signup"
import Dashboard from "@/pages/Dashboard";
import Loading from "@/pages/Loading";
import Verify from "@/pages/Verify";
import Recovery from "@/pages/Recovery";
import ConfirmRecovery from "@/pages/ConfirmRecovery"
import Reset from "@/pages/Reset"


export function PrivateRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <Loading />;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

export function PublicRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <Loading />;
  if (user) return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>

        <Route
          path="/login"
          element={
            <PublicRoute>
              <Login />
            </PublicRoute>
          }
        />

        <Route
          path="/signup"
          element={
            <PublicRoute>
              <Signup />
            </PublicRoute>
          }
        />

        <Route
          path="/verify"
          element={
            <PublicRoute>
              <Verify />
            </PublicRoute>
          }
        />

        <Route
          path="/recovery"
          element={
            <PublicRoute>
              <Recovery />
            </PublicRoute>
          }
        />

        <Route
          path="/confirm-recovery"
          element={
            <PublicRoute>
              <ConfirmRecovery />
            </PublicRoute>
          }
        />

        <Route
          path="/reset"
          element={
            <PublicRoute>
              <Reset />
            </PublicRoute>
          }
        />

        <Route
          path="/"
          element={
            <PrivateRoute>
              <Dashboard />
            </PrivateRoute>
          }
        />

      </Routes>
    </BrowserRouter>
  );
}