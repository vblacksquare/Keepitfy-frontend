
import { createContext, useContext, useState, useEffect, useCallback } from "react";
import type { ReactNode } from "react"; 
import { api } from "@/api"


interface Credentials {
  email: string
  password: string
}

interface AuthContextType {
  user: any | null;
  verifyUsername: string | null;
  recoveryEmail: string | null;
  recoveryCode: string | null;
  loading: boolean;
  isAuthenticated: boolean;
  login: (credentials: Credentials) => Promise<void>;
  register: (credentials: Credentials) => Promise<void>;
  verify: (token: string) => Promise<void>;
  resendCode: () => Promise<void>;
  forgotPassword: (email: string) => Promise<void>;
  confirmForgot: (code: string) => Promise<void>;
  resetPassword: (password: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [initialized, setInitialized] = useState(false);
  const [verifyUsername, setVerifyUsername] = useState<string | null>(null);

  const [recoveryEmail, setRecoveryEmail] = useState<string | null>(null);
  const [recoveryCode, setRecoveryCode] = useState<string | null>(null);

  const fetchSession = useCallback(async () => {
    if (initialized) return;

    try {
      const res = await api.get("/api/v1/users/me/")
      const data = await res.data;
      setUser(data);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
      setInitialized(true);
    }
  }, [initialized]);

  useEffect(() => {
    fetchSession();
  }, [fetchSession]);

  const login = async (credentials: Credentials) => {
    const res = await api.post(
      "/api/v1/users/login/",
      credentials
    )

    const data = await res.data

    localStorage.setItem("access", data.access)
    
    setInitialized(false);
    await fetchSession();
  };

  const register = async (credentials: Credentials) => {
    await api.post(
      "/api/v1/users/register/",
      credentials
    )

    setVerifyUsername(credentials.email);
  };

  const resendCode = async () => {
    api.post(
      "/api/v1/users/register/",
      {
        "email": verifyUsername,
        "password": "( () ) 👈 👍"
      },
    )
  }

  const forgotPassword = async (email: string) => {
    await api.post(
      "/api/v1/users/forgot/",
      {
        "email": email
      }
    )
    setRecoveryEmail(email);
  }

  const confirmForgot = async (code: string) => {
    await api.post(
      "/api/v1/users/confirm-forgot/",
      {
        "email": recoveryEmail,
        "code": code
      }
    )
    setRecoveryCode(code);
  }

  const resetPassword = async (password: string) => {
    await api.post(
      "/api/v1/users/reset/",
      {
        "email": recoveryEmail,
        "code": recoveryCode,
        "password": password
      }
    )

    setRecoveryEmail(null);
    setRecoveryCode(null);
  }

  const verify = async (code: string) => {
    await api.post(
      "/api/v1/users/verify/",
      {
        email: verifyUsername, 
        code: code
      }
    )
  }

  const logout = async () => {
    await api.get("/api/v1/users/logout/")
    localStorage.removeItem("access")
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{ 
        user, verifyUsername, 
        recoveryEmail, recoveryCode, 
        loading, isAuthenticated: !!user, 
        login, register, verify, resendCode, 
        forgotPassword, logout, refresh: fetchSession,
        confirmForgot, resetPassword
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within an AuthProvider");
  return context;
};