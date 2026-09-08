// VIOLATION: domain layer importing a provider SDK directly.
import Stripe from "stripe";

export const charge = (client: Stripe) => client;
