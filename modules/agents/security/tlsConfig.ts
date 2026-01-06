/**
 * TLS Configuration Module
 * Phase 3: External Orchestrator Support
 * 
 * Handles TLS/mTLS configuration for external orchestrator connections:
 * - Certificate loading (CA, client cert, client key)
 * - Certificate validation
 * - Revocation checking (CRL/OCSP)
 * - mTLS mutual authentication
 */

import * as fs from "fs";
import * as https from "https";
import * as tls from "tls";

export interface TLSConfig {
  verify: boolean;
  caCertPemRef?: string; // Path to CA certificate file
  clientCertPemRef?: string; // Path to client certificate file (mTLS)
  clientKeyPemRef?: string; // Path to client private key file (mTLS)
  revocationCheck?: "crl" | "ocsp" | "none";
}

export interface TLSContext {
  ca?: Buffer;
  cert?: Buffer;
  key?: Buffer;
  rejectUnauthorized: boolean;
  checkServerIdentity?: (host: string, cert: tls.PeerCertificate) => Error | undefined;
}

/**
 * Load TLS context from configuration
 */
export async function loadTLSContext(config: TLSConfig): Promise<TLSContext> {
  const context: TLSContext = {
    rejectUnauthorized: config.verify,
  };

  // Load CA certificate
  if (config.caCertPemRef) {
    try {
      context.ca = fs.readFileSync(config.caCertPemRef);
    } catch (error) {
      throw new Error(`Failed to load CA certificate from ${config.caCertPemRef}: ${error}`);
    }
  }

  // Load client certificate (mTLS)
  if (config.clientCertPemRef) {
    try {
      context.cert = fs.readFileSync(config.clientCertPemRef);
    } catch (error) {
      throw new Error(`Failed to load client certificate from ${config.clientCertPemRef}: ${error}`);
    }
  }

  // Load client private key (mTLS)
  if (config.clientKeyPemRef) {
    try {
      context.key = fs.readFileSync(config.clientKeyPemRef);
    } catch (error) {
      throw new Error(`Failed to load client key from ${config.clientKeyPemRef}: ${error}`);
    }
  }

  // Add custom server identity check with revocation checking
  if (config.revocationCheck && config.revocationCheck !== "none") {
    context.checkServerIdentity = (host: string, cert: tls.PeerCertificate) => {
      // Standard hostname verification
      const err = tls.checkServerIdentity(host, cert);
      if (err) {
        return err;
      }

      // Check certificate revocation
      if (config.revocationCheck === "crl") {
        return checkCRL(cert);
      } else if (config.revocationCheck === "ocsp") {
        return checkOCSP(cert);
      }

      return undefined;
    };
  }

  return context;
}

/**
 * Check certificate revocation via CRL
 * MVP: Placeholder implementation
 * TODO: Implement actual CRL checking
 */
function checkCRL(cert: tls.PeerCertificate): Error | undefined {
  // In production, this would:
  // 1. Extract CRL distribution points from cert
  // 2. Download CRL from distribution points
  // 3. Parse CRL and check if cert serial number is revoked
  // 4. Cache CRL with expiry
  
  // MVP: No-op (assume not revoked)
  return undefined;
}

/**
 * Check certificate revocation via OCSP
 * MVP: Placeholder implementation
 * TODO: Implement actual OCSP checking
 */
function checkOCSP(cert: tls.PeerCertificate): Error | undefined {
  // In production, this would:
  // 1. Extract OCSP responder URL from cert
  // 2. Build OCSP request with cert serial number
  // 3. Send OCSP request to responder
  // 4. Parse OCSP response (good/revoked/unknown)
  // 5. Cache OCSP response with nextUpdate
  
  // MVP: No-op (assume not revoked)
  return undefined;
}

/**
 * Create HTTPS agent with TLS configuration
 */
export function createHTTPSAgent(tlsContext: TLSContext): https.Agent {
  return new https.Agent({
    ca: tlsContext.ca,
    cert: tlsContext.cert,
    key: tlsContext.key,
    rejectUnauthorized: tlsContext.rejectUnauthorized,
    checkServerIdentity: tlsContext.checkServerIdentity,
    // Connection pooling
    keepAlive: true,
    maxSockets: 50,
    maxFreeSockets: 10,
    timeout: 60000, // 60s
  });
}

/**
 * Validate certificate chain
 */
export function validateCertificateChain(cert: tls.PeerCertificate, ca: Buffer): boolean {
  try {
    // In production, use crypto.X509Certificate to validate chain
    // MVP: Assume valid if CA is provided
    return !!ca;
  } catch (error) {
    return false;
  }
}

/**
 * Check if certificate is expired
 */
export function isCertificateExpired(cert: tls.PeerCertificate): boolean {
  const now = new Date();
  const validFrom = new Date(cert.valid_from);
  const validTo = new Date(cert.valid_to);
  
  return now < validFrom || now > validTo;
}

/**
 * Extract certificate subject
 */
export function getCertificateSubject(cert: tls.PeerCertificate): string {
  return cert.subject.CN || cert.subject.O || "Unknown";
}

/**
 * Extract certificate issuer
 */
export function getCertificateIssuer(cert: tls.PeerCertificate): string {
  return cert.issuer.CN || cert.issuer.O || "Unknown";
}
