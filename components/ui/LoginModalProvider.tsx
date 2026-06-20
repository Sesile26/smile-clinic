"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { LoginModal } from "./LoginModal";
import { DemoAccessBanner } from "./DemoAccessBanner";

interface LoginModalContextValue {
  isOpen: boolean;
  open: () => void;
  close: () => void;
}

const LoginModalContext = createContext<LoginModalContextValue | null>(null);

export function useLoginModal(): LoginModalContextValue {
  const ctx = useContext(LoginModalContext);
  if (!ctx) {
    throw new Error("useLoginModal must be used within <LoginModalProvider>");
  }
  return ctx;
}

export function LoginModalProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);

  const value = useMemo(
    () => ({ isOpen, open, close }),
    [isOpen, open, close],
  );

  return (
    <LoginModalContext.Provider value={value}>
      {children}
      <LoginModal open={isOpen} onClose={close} />
      <DemoAccessBanner />
    </LoginModalContext.Provider>
  );
}
