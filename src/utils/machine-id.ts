import { networkInterfaces } from 'os';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { logger } from './logger.js';

/**
 * Generate a deterministic machine ID based on network MAC address.
 * Falls back to a UUID if no valid MAC address is found.
 * 
 * @returns {string} A SHA-256 hash of the MAC address or a UUID
 */
export function getMachineId(): string {
  try {
    const interfaces = networkInterfaces();
    const invalidMacAddresses = new Set(['00:00:00:00:00:00', 'ff:ff:ff:ff:ff:ff']);
    
    for (const interfaceName in interfaces) {
      const networkInterface = interfaces[interfaceName];
      
      if (networkInterface) {
        for (const { mac } of networkInterface) {
          if (mac && !invalidMacAddresses.has(mac)) {
            // Use MAC address as a seed for a deterministic machine ID
            return crypto.createHash('sha256').update(mac, 'utf8').digest('hex');
          }
        }
      }
    }
    
    // No valid MAC address found, fall back to UUID
    logger.warn('No valid MAC address found for machine ID, using UUID instead');
    return uuidv4();
  } catch (error) {
    logger.error('Error generating machine ID:', error);
    return uuidv4();
  }
}
