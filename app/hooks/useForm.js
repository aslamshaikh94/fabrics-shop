"use client";
import { useState, useCallback } from "react";

/**
 * Custom hook for managing form state
 * Handles form data, validation errors, and submission
 */
export function useForm(initialData, onSubmit, validator = null) {
  const [formData, setFormData] = useState(initialData);
  const [errors, setErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleChange = useCallback(
    (e) => {
      const { name, value, type, checked } = e.target;
      setFormData((prev) => ({
        ...prev,
        [name]: type === "checkbox" ? checked : value,
      }));
      // Clear error for this field when user starts typing
      if (errors[name]) {
        setErrors((prev) => {
          const newErrors = { ...prev };
          delete newErrors[name];
          return newErrors;
        });
      }
    },
    [errors],
  );

  const handleReset = useCallback(() => {
    setFormData(initialData);
    setErrors({});
  }, [initialData]);

  const handleSubmit = useCallback(
    async (e) => {
      e.preventDefault();

      // Run validation if validator is provided
      if (validator) {
        const newErrors = validator(formData);
        if (Object.keys(newErrors).length > 0) {
          setErrors(newErrors);
          return;
        }
      }

      setIsSubmitting(true);
      try {
        await onSubmit(formData);
        setErrors({});
      } catch (err) {
        setErrors({ submit: err.message });
        console.error("Form submission error:", err);
      } finally {
        setIsSubmitting(false);
      }
    },
    [formData, onSubmit, validator],
  );

  const setFieldValue = useCallback((name, value) => {
    setFormData((prev) => ({ ...prev, [name]: value }));
  }, []);

  const setFieldError = useCallback((name, error) => {
    setErrors((prev) => ({ ...prev, [name]: error }));
  }, []);

  return {
    formData,
    setFormData,
    errors,
    setErrors,
    isSubmitting,
    handleChange,
    handleSubmit,
    handleReset,
    setFieldValue,
    setFieldError,
  };
}

/**
 * Hook for managing simple filter state (search, date range, etc.)
 */
export function useFilters(initialFilters = {}) {
  const [filters, setFilters] = useState(initialFilters);

  const updateFilter = useCallback((name, value) => {
    setFilters((prev) => ({ ...prev, [name]: value }));
  }, []);

  const resetFilters = useCallback(() => {
    setFilters(initialFilters);
  }, [initialFilters]);

  const clearFilter = useCallback((name) => {
    setFilters((prev) => {
      const newFilters = { ...prev };
      delete newFilters[name];
      return newFilters;
    });
  }, []);

  return { filters, updateFilter, resetFilters, clearFilter };
}

/**
 * Hook for pagination
 */
export function usePagination(items = [], pageSize = 10) {
  const [page, setPage] = useState(1);

  const totalPages = Math.ceil(items.length / pageSize);
  const startIndex = (page - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const paginatedItems = items.slice(startIndex, endIndex);

  const goToPage = useCallback(
    (newPage) => {
      const validPage = Math.max(1, Math.min(newPage, totalPages || 1));
      setPage(validPage);
    },
    [totalPages],
  );

  const nextPage = useCallback(() => goToPage(page + 1), [page, goToPage]);
  const prevPage = useCallback(() => goToPage(page - 1), [page, goToPage]);

  return {
    page,
    totalPages,
    paginatedItems,
    goToPage,
    nextPage,
    prevPage,
  };
}
