import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { notify, notifyMany } from '../src/common/notify';
import {
  listMine,
  unreadCount,
  markRead,
  markAllRead,
} from '../src/modules/notifications/notification.service';

let mongod: MongoMemoryServer;
const u1 = new mongoose.Types.ObjectId().toString();
const u2 = new mongoose.Types.ObjectId().toString();

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
}, 120_000);

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

describe('notifications service', () => {
  it('creates, lists (scoped), counts and marks read', async () => {
    await notify({ userId: u1, type: 'test', title: 'A' });
    await notify({ userId: u1, type: 'test', title: 'B', link: '/x' });
    await notify({ userId: u2, type: 'test', title: 'C' }); // another user

    const list = await listMine(u1, { limit: 20 });
    expect(list.map((n) => n.title).sort()).toEqual(['A', 'B']); // scoped to u1
    expect((await unreadCount(u1)).unread).toBe(2);

    await markRead(u1, list[0].id);
    expect((await unreadCount(u1)).unread).toBe(1);

    // The unread filter now returns only the one still-unread item.
    expect((await listMine(u1, { limit: 20, unread: true })).length).toBe(1);

    // You cannot mark another user's notification read.
    const [other] = await listMine(u2, { limit: 20 });
    await expect(markRead(u1, other.id)).rejects.toThrow();

    await markAllRead(u1);
    expect((await unreadCount(u1)).unread).toBe(0);
    // u2 is unaffected.
    expect((await unreadCount(u2)).unread).toBe(1);
  });

  it('notifyMany dedupes and excludes the actor', async () => {
    const a = new mongoose.Types.ObjectId().toString();
    const b = new mongoose.Types.ObjectId().toString();
    await notifyMany([a, a, b, undefined, null], { type: 'bulk', title: 'Hi' }, b);
    expect((await unreadCount(a)).unread).toBe(1); // deduped to one
    expect((await unreadCount(b)).unread).toBe(0); // excluded
  });
});
