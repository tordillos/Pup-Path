import { pgTable, text, timestamp, integer, boolean, uuid, uniqueIndex, index } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

export const profiles = pgTable('profiles', {
  id: uuid('id').primaryKey(), // Matches Supabase auth.users.id
  email: text('email'),
  fullName: text('full_name'),
  avatarUrl: text('avatar_url'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const dogs = pgTable('dogs', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id')
    .references(() => profiles.id, { onDelete: 'cascade' })
    .notNull(),
  name: text('name').notNull().default('Mi Perro'),
  breed: text('breed').default('Border Collie'),
  birthDate: text('birth_date'),
  shareCode: text('share_code').unique(),
  isCurrent: boolean('is_current').default(true).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const dogMembers = pgTable(
  'dog_members',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    dogId: uuid('dog_id')
      .references(() => dogs.id, { onDelete: 'cascade' })
      .notNull(),
    userId: uuid('user_id')
      .references(() => profiles.id, { onDelete: 'cascade' })
      .notNull(),
    role: text('role', { enum: ['owner', 'trainer', 'viewer'] })
      .notNull()
      .default('trainer'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('dog_user_unique_idx').on(table.dogId, table.userId),
  ]
);

export const taskProgress = pgTable(
  'task_progress',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    dogId: uuid('dog_id')
      .references(() => dogs.id, { onDelete: 'cascade' })
      .notNull(),
    taskId: text('task_id').notNull(),
    status: text('status', { enum: ['pendiente', 'progreso', 'dominado'] })
      .notNull()
      .default('pendiente'),
    sessions: integer('sessions').default(0).notNull(),
    notes: text('notes'),
    masteredAt: timestamp('mastered_at', { withTimezone: true }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('dog_task_unique_idx').on(table.dogId, table.taskId),
  ]
);

export const trainingSessions = pgTable(
  'training_sessions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    dogId: uuid('dog_id')
      .references(() => dogs.id, { onDelete: 'cascade' })
      .notNull(),
    taskId: text('task_id').notNull(),
    durationMinutes: integer('duration_minutes').default(5),
    rating: integer('rating'), // 1 a 5
    notes: text('notes'),
    performedAt: timestamp('performed_at', { withTimezone: true }).defaultNow().notNull(),
  },
  // El calendario lee todo el historial de una mascota ordenado por fecha.
  (table) => [index('training_sessions_dog_date_idx').on(table.dogId, table.performedAt)]
);

// Relations for relational queries
export const profilesRelations = relations(profiles, ({ many }) => ({
  ownedDogs: many(dogs),
  memberships: many(dogMembers),
}));

export const dogsRelations = relations(dogs, ({ one, many }) => ({
  owner: one(profiles, {
    fields: [dogs.userId],
    references: [profiles.id],
  }),
  members: many(dogMembers),
  progress: many(taskProgress),
  sessions: many(trainingSessions),
}));

export const dogMembersRelations = relations(dogMembers, ({ one }) => ({
  dog: one(dogs, {
    fields: [dogMembers.dogId],
    references: [dogs.id],
  }),
  user: one(profiles, {
    fields: [dogMembers.userId],
    references: [profiles.id],
  }),
}));

export const taskProgressRelations = relations(taskProgress, ({ one }) => ({
  dog: one(dogs, {
    fields: [taskProgress.dogId],
    references: [dogs.id],
  }),
}));

export const trainingSessionsRelations = relations(trainingSessions, ({ one }) => ({
  dog: one(dogs, {
    fields: [trainingSessions.dogId],
    references: [dogs.id],
  }),
}));

export type Profile = typeof profiles.$inferSelect;
export type NewProfile = typeof profiles.$inferInsert;

export type Dog = typeof dogs.$inferSelect;
export type NewDog = typeof dogs.$inferInsert;

export type DogMember = typeof dogMembers.$inferSelect;
export type NewDogMember = typeof dogMembers.$inferInsert;

export type DbTaskProgress = typeof taskProgress.$inferSelect;
export type NewDbTaskProgress = typeof taskProgress.$inferInsert;

export type TrainingSession = typeof trainingSessions.$inferSelect;
export type NewTrainingSession = typeof trainingSessions.$inferInsert;
