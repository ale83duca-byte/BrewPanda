
import { openDB, DBSchema } from 'idb';
import type { BreweryData } from '../types';

interface BrewPandaDB extends DBSchema {
  brewery_data: {
    key: string; // year
    value: BreweryData;
  };
}

const DB_NAME = 'BrewPandaDB';
const DB_VERSION = 1;

const dbPromise = openDB<BrewPandaDB>(DB_NAME, DB_VERSION, {
  upgrade(db) {
    if (!db.objectStoreNames.contains('brewery_data')) {
      db.createObjectStore('brewery_data');
    }
  },
});

export const getDb = () => dbPromise;

export const migrateFromLocalStorage = async (): Promise<boolean> => {
    const yearsToMigrate = Object.keys(localStorage).filter(key => key.startsWith('birrificio_'));
    if (yearsToMigrate.length === 0) {
        return false; // No migration needed
    }

    console.log(`Migrating ${yearsToMigrate.length} year(s) from localStorage to IndexedDB...`);
    const db = await getDb();
    const tx = db.transaction('brewery_data', 'readwrite');
    const store = tx.objectStore('brewery_data');

    for (const storageKey of yearsToMigrate) {
        try {
            const year = storageKey.replace('birrificio_', '');
            const dataString = localStorage.getItem(storageKey);
            if (dataString) {
                const data = JSON.parse(dataString);
                await store.put(data, year);
                localStorage.removeItem(storageKey);
                console.log(`- Migrated and removed year ${year}`);
            }
        } catch (error) {
            console.error(`Failed to migrate year from key ${storageKey}`, error);
        }
    }

    await tx.done;
    console.log('Migration complete.');
    return true;
};

export const factoryReset = async (): Promise<void> => {
    const db = await getDb();
    await db.clear('brewery_data');
    console.log('Database has been reset to factory settings.');
};
