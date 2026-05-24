import {
  pgTable, uuid, varchar, text, jsonb, timestamp, numeric, boolean,
  primaryKey, index,
} from 'drizzle-orm/pg-core';
import { AnyPgColumn } from 'drizzle-orm/pg-core';

export const orgUnits = pgTable('org_units', {
  id: uuid('id').defaultRandom().primaryKey(),
  parentId: uuid('parent_id').references((): AnyPgColumn => orgUnits.id),
  name: varchar('name', { length: 255 }).notNull(),
  type: varchar('type', { length: 30 }).notNull(),
  path: varchar('path', { length: 500 }).notNull(),
  meta: jsonb('meta'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  pathIdx: index('org_units_path_idx').on(table.path),
}));

export const roles = pgTable('roles', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: varchar('name', { length: 100 }).notNull(),
  permissions: jsonb('permissions').$type<string[]>().notNull(),
  orgUnitId: uuid('org_unit_id').references(() => orgUnits.id),
});

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: varchar('email', { length: 255 }).unique().notNull(),
  roleId: uuid('role_id').references(() => roles.id).notNull(),
  orgUnitId: uuid('org_unit_id').references(() => orgUnits.id).notNull(),
  profile: jsonb('profile').$type<{ name: string; avatar?: string }>(),
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const resources = pgTable('resources', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgUnitId: uuid('org_unit_id').references(() => orgUnits.id).notNull(),
  type: varchar('type', { length: 50 }).notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  status: varchar('status', { length: 30 }).default('active').notNull(),
  telemetry: jsonb('telemetry').$type<{
    temperature?: number;
    humidity?: number;
    soilMoisture?: number;
    gps?: { lat: number; lng: number };
    battery?: number;
  }>(),
  meta: jsonb('meta'),
  lastSeen: timestamp('last_seen', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const inventory = pgTable('inventory', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgUnitId: uuid('org_unit_id').references(() => orgUnits.id).notNull(),
  sku: varchar('sku', { length: 100 }).notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  quantity: numeric('quantity', { precision: 12, scale: 2 }).notNull(),
  unit: varchar('unit', { length: 20 }).notNull(),
  reorderPoint: numeric('reorder_point', { precision: 12, scale: 2 }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const iotTelemetry = pgTable('iot_telemetry', {
  time: timestamp('time', { withTimezone: true }).notNull().defaultNow(),
  resourceId: uuid('resource_id').references(() => resources.id).notNull(),
  deviceId: varchar('device_id', { length: 50 }).notNull(),
  payload: jsonb('payload').notNull(),
  signal: varchar('signal', { length: 20 }),
}, (table) => ({
  pk: primaryKey({ columns: [table.resourceId, table.time] }),
}));
