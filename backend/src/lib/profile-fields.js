'use strict';
const limits = { firstname:80, lastname:80, phone:32, billingAddress:300 };
function profileFields(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid profile');
  if (!Object.keys(input).length) throw new Error('Empty profile');
  if (Object.keys(input).some(key => !Object.hasOwn(limits,key))) throw new Error('Unknown field');
  const data = {};
  for (const [key,value] of Object.entries(input)) {
    if (typeof value !== 'string' || value.trim().length > limits[key] || /[\u0000-\u001f\u007f]/.test(value)) throw new Error('Invalid field');
    data[key] = value.trim();
  }
  if (data.phone && (!/^[+\d() .-]{3,32}$/.test(data.phone) || data.phone.replace(/\D/g,'').length<3)) throw new Error('Invalid phone');
  return data;
}
module.exports = {profileFields};
