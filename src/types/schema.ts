export * from "@antinna/schema-ld-types";

// Maintain backward compatibility for ItemAvailability if needed,
// though the package has its own ItemAvailability interface.
// The package's ItemAvailability is an interface, while the old one was a union of strings.
// We'll see how this affects the codebase.

export type ItemAvailabilityString =
  | "https://schema.org/InStock"
  | "https://schema.org/OutOfStock"
  | "https://schema.org/OnlineOnly"
  | "https://schema.org/InStoreOnly"
  | "https://schema.org/PreOrder"
  | "https://schema.org/PreSale"
  | "https://schema.org/LimitedAvailability"
  | "https://schema.org/SoldOut"
  | "https://schema.org/Discontinued";
