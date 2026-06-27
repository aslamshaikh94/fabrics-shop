// Form validation schemas using basic validation (zod can be added later if needed)

export const validateCurrentItem = (item) => {
  const itemErrors = {};
  if (!item.fabric_name || item.fabric_name.trim() === "") {
    itemErrors.fabric_name = "Fabric name is required";
  }
  if (!item.meters || parseFloat(item.meters) <= 0) {
    itemErrors.meters = "Meters must be greater than 0";
  }
  if (!item.price_per_meter || parseFloat(item.price_per_meter) < 0) {
    itemErrors.price_per_meter = "Price must be 0 or greater";
  }
  return itemErrors;
};

export const validateSale = (formData) => {
  const errors = {};
  if (!formData.customer_id && !formData.customer_name)
    errors.customer = "Customer is required";

  // Validate ALL items, not just the first one
  if (!formData.items || formData.items.length === 0) {
    errors.items = "At least one item is required";
  } else {
    // Validate all items except the last one, UNLESS it's the only item.
    // The last item is considered the "new item" row and is validated on "Add Item".
    const numItemsToValidate =
      formData.items.length === 1
        ? 1 // If only one item, validate it (it's the primary item for the sale)
        : formData.items.length - 1; // Otherwise, validate all but the last (the "new item" row)
    for (let i = 0; i < numItemsToValidate; i++) {
      const item = formData.items[i];
      if (!item.fabric_name || item.fabric_name.trim() === "") {
        errors[`fabric_name_${i}`] = `Item ${i + 1}: Fabric name is required`;
      }
      if (!item.meters || parseFloat(item.meters) <= 0) {
        errors[`meters_${i}`] = `Item ${i + 1}: Meters must be greater than 0`;
      }
      if (!item.price_per_meter || parseFloat(item.price_per_meter) < 0) {
        errors[`price_per_meter_${i}`] =
          `Item ${i + 1}: Price must be 0 or greater`;
      }
      if (
        item.cost_price_per_meter &&
        parseFloat(item.cost_price_per_meter) < 0
      ) {
        errors[`cost_price_per_meter_${i}`] =
          `Item ${i + 1}: Cost price must be 0 or greater`;
      }
    }
  }

  if (!formData.sale_date) errors.sale_date = "Sale date is required";
  if (!formData.payment_type) errors.payment_type = "Payment type is required";
  if (
    formData.payment_type !== "cash" &&
    formData.initial_payment &&
    parseFloat(formData.initial_payment) < 0
  ) {
    errors.initial_payment = "Initial payment must be 0 or greater";
  }
  // Validate discount amount
  if (formData.discount_amount && parseFloat(formData.discount_amount) < 0) {
    errors.discount_amount = "Discount amount must be 0 or greater";
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
