// Form validation schemas using basic validation (zod can be added later if needed)

export const validateSale = (formData) => {
  const errors = {};
  if (!formData.customer_id && !formData.customer_name)
    errors.customer = "Customer is required";

  const firstItem = formData.items && formData.items[0];
  if (
    !firstItem ||
    !firstItem.fabric_name ||
    firstItem.fabric_name.trim() === ""
  )
    errors.fabric_name = "Fabric name is required";
  if (!firstItem || !firstItem.meters || parseFloat(firstItem.meters) <= 0)
    errors.meters = "Meters must be greater than 0";
  if (
    !firstItem ||
    !firstItem.price_per_meter ||
    parseFloat(firstItem.price_per_meter) < 0
  )
    errors.price_per_meter = "Price must be 0 or greater";

  if (
    firstItem &&
    firstItem.cost_price_per_meter &&
    parseFloat(firstItem.cost_price_per_meter) < 0
  )
    errors.cost_price_per_meter = "Cost price must be 0 or greater";

  if (!formData.sale_date) errors.sale_date = "Sale date is required";
  if (!formData.payment_type) errors.payment_type = "Payment type is required";
  if (
    formData.payment_type !== "cash" &&
    formData.initial_payment &&
    parseFloat(formData.initial_payment) < 0
  ) {
    errors.initial_payment = "Initial payment must be 0 or greater";
  }
  return errors;
};

export const validatePurchase = (formData) => {
  const errors = {};
  if (!formData.supplier_id || formData.supplier_id.trim() === "")
    errors.supplier_id = "Supplier is required";
  if (!formData.total_amount || parseFloat(formData.total_amount) <= 0)
    errors.total_amount = "Total amount must be greater than 0";
  if (!formData.purchase_date)
    errors.purchase_date = "Purchase date is required";
  return errors;
};

export const validatePayment = (formData) => {
  const errors = {};
  if (!formData.amount || parseFloat(formData.amount) <= 0)
    errors.amount = "Amount must be greater than 0";
  if (!formData.payment_date) errors.payment_date = "Payment date is required";
  if (!formData.payment_method || formData.payment_method.trim() === "")
    errors.payment_method = "Payment method is required";
  return errors;
};

export const validateSupplier = (formData) => {
  const errors = {};
  if (!formData.name || formData.name.trim() === "")
    errors.name = "Name is required";
  if (
    formData.phone &&
    !/^[0-9\-\+\s]{10,}$/.test(formData.phone.replace(/\D/g, ""))
  ) {
    errors.phone = "Phone number must be valid";
  }
  return errors;
};

export const validateCustomer = (formData) => {
  const errors = {};
  if (!formData.name || formData.name.trim() === "")
    errors.name = "Name is required";
  if (
    formData.phone &&
    !/^[0-9\-\+\s]{10,}$/.test(formData.phone.replace(/\D/g, ""))
  ) {
    errors.phone = "Phone number must be valid";
  }
  return errors;
};

export const validateExpense = (formData) => {
  const errors = {};
  if (!formData.title || formData.title.trim() === "")
    errors.title = "Title is required";
  if (!formData.category || formData.category.trim() === "")
    errors.category = "Category is required";
  if (!formData.amount || parseFloat(formData.amount) <= 0)
    errors.amount = "Amount must be greater than 0";
  if (!formData.expense_date) errors.expense_date = "Date is required";
  return errors;
};

export const validateFabric = (formData) => {
  const errors = {};
  if (!formData.name || formData.name.trim() === "")
    errors.name = "Name is required";
  if (formData.cost_per_meter && parseFloat(formData.cost_per_meter) < 0)
    errors.cost_per_meter = "Cost must be 0 or greater";
  if (formData.available_meters && parseFloat(formData.available_meters) < 0)
    errors.available_meters = "Meters must be 0 or greater";
  return errors;
};

export const hasErrors = (errors) => Object.keys(errors).length > 0;
