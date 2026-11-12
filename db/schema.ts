import { sqliteTable,text,integer } from 'drizzle-orm/sqlite-core';
export const clinicVault=sqliteTable('clinic_vault',{id:text('id').primaryKey(),ownerId:text('owner_id').notNull(),revision:integer('revision').notNull().default(0),payload:text('payload').notNull()});
