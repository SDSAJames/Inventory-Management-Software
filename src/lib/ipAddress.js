import { IP_PREFIX } from './constants.js';
import { validOctet } from './utils.js';

export function ipAddressToForm(ip = '') {
  const raw = String(ip);
  const [ipSubnet = '', ipNumber = ''] = (raw.startsWith(IP_PREFIX) ? raw.slice(IP_PREFIX.length) : raw).split('.');
  return { ipSubnet, ipNumber };
}

export function buildIpAddress({ ipSubnet, ipNumber }) {
  return ipSubnet && ipNumber ? `${IP_PREFIX}${ipSubnet}.${ipNumber}` : '';
}

export function isIpAddressInvalid({ ipSubnet, ipNumber }) {
  return !validOctet(ipSubnet) || !validOctet(ipNumber);
}
