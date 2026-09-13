/**
 * DI token for the active {@link import("./port.js").CredentialAdapter}
 * (T035). Phase 1 wires only the development adapter (R5: a production
 * provider is deferred/conditional) -- callers depend on the port, never on
 * `DevCredentialAdapter` directly, so swapping the binding later needs no
 * caller change.
 */
export const CREDENTIAL_ADAPTER = Symbol("CREDENTIAL_ADAPTER");
