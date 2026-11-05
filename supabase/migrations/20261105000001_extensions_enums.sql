-- LocalLoop · 0001 · extensions and enumerated types
-- Supabase ships postgis, pgcrypto, pg_trgm; enable them in the `extensions`
-- schema per Supabase convention.

create schema if not exists extensions;
create extension if not exists postgis with schema extensions;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_trgm with schema extensions;

create type public.app_role as enum ('customer', 'vendor', 'delivery_partner', 'admin');
create type public.admin_role as enum ('super_admin', 'operations', 'support', 'finance');
create type public.app_language as enum ('en', 'te');
create type public.verification_status as enum ('pending', 'approved', 'rejected', 'suspended');
create type public.vendor_plan as enum ('free', 'basic', 'premium');
create type public.vehicle_type as enum ('bicycle', 'scooter', 'motorcycle', 'car');
create type public.category_kind as enum ('store', 'product');
create type public.product_unit as enum ('piece', 'kg', 'g', 'l', 'ml', 'packet', 'box', 'dozen');

create type public.order_status as enum (
  'placed', 'accepted', 'preparing', 'ready_for_pickup', 'picked_up', 'delivered', 'rejected', 'cancelled'
);
create type public.assignment_status as enum (
  'offered', 'accepted', 'rejected', 'expired', 'cancelled', 'picked_up', 'delivered'
);
create type public.payment_method as enum ('cod', 'test', 'razorpay');
create type public.payment_status as enum ('pending', 'paid', 'failed', 'refunded');
create type public.discount_type as enum ('percent', 'flat');
create type public.review_target as enum ('store', 'product', 'delivery_partner');
create type public.review_status as enum ('published', 'hidden', 'under_review');
create type public.ticket_status as enum ('open', 'in_progress', 'resolved', 'closed');
create type public.ticket_priority as enum ('low', 'normal', 'high', 'urgent');
create type public.document_status as enum ('pending', 'approved', 'rejected');
create type public.route_leg as enum ('to_store', 'to_customer');
