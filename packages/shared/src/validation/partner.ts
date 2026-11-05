import { z } from 'zod';
import { MOTORISED_VEHICLES, VEHICLE_TYPES } from '../constants/catalog';
import { optionalEmail, personName } from './common';

/** Indian vehicle registration, e.g. TS 16 AB 1234 / TS16AB1234 / 22 BH 1234 AA. */
const vehicleReg = z
  .string()
  .trim()
  .toUpperCase()
  .transform((v) => v.replace(/[\s-]/g, ''))
  .pipe(z.string().regex(/^([A-Z]{2}\d{1,2}[A-Z]{0,3}\d{4}|\d{2}BH\d{4}[A-Z]{1,2})$/, 'validation.vehicle_reg_invalid'));

/** DL format: 2-letter state, 2-digit RTO, then 11 digits (spaces/hyphens allowed). */
const drivingLicence = z
  .string()
  .trim()
  .toUpperCase()
  .transform((v) => v.replace(/[\s-]/g, ''))
  .pipe(z.string().regex(/^[A-Z]{2}\d{2}\d{11}$/, 'validation.licence_invalid'));

export const partnerRegistrationSchema = z
  .object({
    fullName: personName,
    email: optionalEmail,
    vehicleType: z.enum(VEHICLE_TYPES),
    vehicleRegistration: z.string().optional(),
    drivingLicence: z.string().optional(),
  })
  .superRefine((v, ctx) => {
    if (!MOTORISED_VEHICLES.includes(v.vehicleType)) return;
    const reg = vehicleReg.safeParse(v.vehicleRegistration ?? '');
    if (!reg.success) {
      ctx.addIssue({ code: 'custom', path: ['vehicleRegistration'], message: 'validation.vehicle_reg_invalid' });
    }
    const dl = drivingLicence.safeParse(v.drivingLicence ?? '');
    if (!dl.success) {
      ctx.addIssue({ code: 'custom', path: ['drivingLicence'], message: 'validation.licence_invalid' });
    }
  })
  .transform((v) => {
    const motorised = MOTORISED_VEHICLES.includes(v.vehicleType);
    return {
      ...v,
      vehicleRegistration: motorised ? vehicleReg.parse(v.vehicleRegistration) : null,
      drivingLicence: motorised ? drivingLicence.parse(v.drivingLicence) : null,
    };
  });

export type PartnerRegistrationInput = z.input<typeof partnerRegistrationSchema>;
