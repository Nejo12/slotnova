// VIOLATION: one module importing another module's infrastructure/repository.
import { paymentsRepo } from "../payments/infrastructure/repo";

export const book = () => paymentsRepo.find();
