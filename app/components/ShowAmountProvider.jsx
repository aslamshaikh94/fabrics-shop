"use client";
import { createContext, useContext, useState, useEffect } from "react";

const ShowAmountContext = createContext();

export function ShowAmountProvider({ children }) {
  const [showAmount, setShowAmount] = useState(true);

  useEffect(() => {
    const saved = localStorage.getItem("showAmount");
    if (saved !== null) {
      setShowAmount(saved === "true");
    }
  }, []);

  const toggleShowAmount = () => {
    setShowAmount((prev) => {
      const next = !prev;
      localStorage.setItem("showAmount", String(next));
      return next;
    });
  };

  return (
    <ShowAmountContext.Provider
      value={{ showAmount, setShowAmount: toggleShowAmount }}
    >
      {children}
    </ShowAmountContext.Provider>
  );
}

export function useShowAmount() {
  const ctx = useContext(ShowAmountContext);
  if (!ctx)
    throw new Error("useShowAmount must be used within ShowAmountProvider");
  return ctx;
}
