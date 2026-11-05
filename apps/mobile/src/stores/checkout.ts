import type { PaymentMethod } from '@localloop/shared';
import { randomUUID } from 'expo-crypto';
import { create } from 'zustand';

interface CheckoutState {
  addressId: string | null;
  couponCode: string | null;
  instructions: string;
  paymentMethod: PaymentMethod;
  /**
   * One key per checkout attempt. Retries (double tap, timeout, app resume)
   * reuse it, so place_order returns the same order instead of a duplicate.
   * Reset only after an order is confirmed.
   */
  idempotencyKey: string;
  setAddress: (id: string | null) => void;
  setCoupon: (code: string | null) => void;
  setInstructions: (v: string) => void;
  setPaymentMethod: (m: PaymentMethod) => void;
  completed: () => void;
}

export const useCheckout = create<CheckoutState>((set) => ({
  addressId: null,
  couponCode: null,
  instructions: '',
  paymentMethod: 'cod',
  idempotencyKey: randomUUID(),
  setAddress: (addressId) => set({ addressId }),
  setCoupon: (couponCode) => set({ couponCode: couponCode ? couponCode.trim().toUpperCase() : null }),
  setInstructions: (instructions) => set({ instructions }),
  setPaymentMethod: (paymentMethod) => set({ paymentMethod }),
  completed: () => set({ couponCode: null, instructions: '', paymentMethod: 'cod', idempotencyKey: randomUUID() }),
}));

/** Location picked on the map while creating an address (location-map → addresses/new). */
interface AddressDraftState {
  point: { latitude: number; longitude: number } | null;
  setPoint: (p: { latitude: number; longitude: number } | null) => void;
}

export const useAddressDraft = create<AddressDraftState>((set) => ({
  point: null,
  setPoint: (point) => set({ point }),
}));
