const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');

const dataDir = path.join(__dirname, '..', '..', 'data');
const collections = new Map();

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function getCollectionPath(name) {
  return path.join(dataDir, `${name}.json`);
}

async function ensureLoaded(name) {
  if (collections.has(name)) return;

  await fs.mkdir(dataDir, { recursive: true });
  const filePath = getCollectionPath(name);

  try {
    const raw = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    collections.set(name, Array.isArray(parsed) ? parsed : []);
  } catch {
    collections.set(name, []);
    await fs.writeFile(filePath, '[]', 'utf8');
  }
}

async function flush(name) {
  const filePath = getCollectionPath(name);
  const docs = collections.get(name) || [];
  await fs.writeFile(filePath, JSON.stringify(docs, null, 2), 'utf8');
}

function matchFieldValue(docValue, queryValue) {
  if (queryValue && typeof queryValue === 'object' && !Array.isArray(queryValue)) {
    if ('$in' in queryValue) {
      return queryValue.$in.map(String).includes(String(docValue));
    }
  }

  if (docValue === undefined && queryValue === null) return true;
  return String(docValue) === String(queryValue);
}

function matchesQuery(doc, query) {
  if (!query || Object.keys(query).length === 0) return true;

  if (query.$or && Array.isArray(query.$or)) {
    return query.$or.some((branch) => matchesQuery(doc, branch));
  }

  for (const [key, value] of Object.entries(query)) {
    if (key === '$or') continue;
    if (!matchFieldValue(doc[key], value)) return false;
  }

  return true;
}

class FileDocument {
  constructor(model, data) {
    this._model = model;
    Object.assign(this, clone(data));
  }

  async save() {
    await ensureLoaded(this._model.collectionName);
    const docs = collections.get(this._model.collectionName);

    if (!this._id) {
      this._id = crypto.randomUUID();
    }

    const idx = docs.findIndex((doc) => String(doc._id) === String(this._id));
    const now = new Date().toISOString();

    if (!this.createdAt) this.createdAt = now;
    this.updatedAt = now;

    const serializable = clone(this);
    delete serializable._model;

    if (idx >= 0) {
      docs[idx] = serializable;
    } else {
      docs.push(serializable);
    }

    await flush(this._model.collectionName);
    return this;
  }
}

function createModel(collectionName, defaults = {}) {
  return class FileModel {
    static collectionName = collectionName;
    static defaults = defaults;

    static async _all() {
      await ensureLoaded(collectionName);
      return collections.get(collectionName);
    }

    static _wrap(raw) {
      if (!raw) return null;
      return new FileDocument(this, raw);
    }

    static async findOne(query) {
      const docs = await this._all();
      const found = docs.find((doc) => matchesQuery(doc, query));
      return this._wrap(found);
    }

    static async findById(id) {
      return this.findOne({ _id: id });
    }

    static async create(data) {
      const payload = {
        ...clone(this.defaults),
        ...clone(data),
        _id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      const docs = await this._all();
      docs.push(payload);
      await flush(collectionName);
      return this._wrap(payload);
    }

    static async updateMany(query, update) {
      const docs = await this._all();
      let modifiedCount = 0;

      for (const doc of docs) {
        if (!matchesQuery(doc, query)) continue;

        if (update.$set && typeof update.$set === 'object') {
          Object.assign(doc, clone(update.$set));
        }

        doc.updatedAt = new Date().toISOString();
        modifiedCount += 1;
      }

      if (modifiedCount > 0) {
        await flush(collectionName);
      }

      return { modifiedCount };
    }

    static async deleteOne(query) {
      const docs = await this._all();
      const idx = docs.findIndex((doc) => matchesQuery(doc, query));
      if (idx < 0) return { deletedCount: 0 };

      docs.splice(idx, 1);
      await flush(collectionName);
      return { deletedCount: 1 };
    }
  };
}

module.exports = {
  createModel
};
