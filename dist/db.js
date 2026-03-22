import "./firebase.js";
import admin from "firebase-admin";
import { getFirestore } from "firebase-admin/firestore";
const db = getFirestore();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
export const collectionNames = ['Events', 'FAQ'];
const DocumentTestKey = "_testing_";
//Read with ID
export async function DBGetWithID(collectionName, id) {
    if (!id) {
        throw new Error("DBGetWithID called with empty id");
    }
    try {
        const res = (await db.collection(collectionName).doc(id).get()).data();
        if (!res)
            return undefined;
        return { ...res, id };
    }
    catch (error) {
        console.error(`Error in DBGetWithID(${collectionName}, ${id}): ${error}`);
        return undefined;
    }
}
//Read muliple documents
export async function DBGet(collectionName, queries, queryStyle, order, limit) {
    try {
        let queryRef = db.collection(collectionName);
        if (queries && queries.length > 0) {
            const filters = queries.map(([field, op, val]) => admin.firestore.Filter.where(field, op, val));
            if (queryStyle === "or") {
                queryRef = queryRef.where(admin.firestore.Filter.or(...filters));
            }
            else {
                for (const [field, op, val] of queries) {
                    queryRef = queryRef.where(field, op, val);
                }
            }
        }
        if (order) {
            const [field, direction] = order;
            queryRef = queryRef.orderBy(field, direction);
        }
        const res = await queryRef.limit(limit ?? 100).get();
        if (res.empty)
            return [];
        const results = [];
        res.forEach((doc) => results.push({ ...doc.data(), id: doc.id }));
        return results;
    }
    catch (error) {
        console.error("DBGet error:", error);
        return [];
    }
}
//Create with auto-generated ID
export async function DBCreate(collectionName, value) {
    const docRef = await db.collection(collectionName).add(value);
    return docRef.id;
}
//Create with custom ID
export async function DBCreateWithID(collectionName, value, id) {
    await db.collection(collectionName).doc(id).set(value);
}
//Update Document
export async function DBUpdate(collectionName, value, queries, queryStyle, combine = false) {
    const res = await DBGet(collectionName, queries, queryStyle);
    res.forEach(async (obj) => {
        let newObj;
        if (combine) {
            newObj = { ...obj, ...value };
        }
        else {
            newObj = value;
        }
        await db.collection(collectionName).doc(obj.id).set(newObj);
    });
    await sleep(150);
}
//Update Document with ID
export async function DBUpdateWithID(collectionName, id, value, combine = false) {
    let newObj;
    if (combine) {
        const obj = await DBGetWithID(collectionName, id);
        newObj = { ...obj, ...value };
    }
    else {
        newObj = value;
    }
    await db.collection(collectionName).doc(id).set(newObj);
}
//Delete
export async function DBDelete(collectionName, queries, queryStyle) {
    const docs = await DBGet(collectionName, queries, queryStyle);
    await Promise.all(docs.map(async (obj) => {
        await db.collection(collectionName).doc(obj.id).delete();
    }));
}
//Delete with ID
export async function DBDeleteWithID(collectionName, id) {
    await db.collection(collectionName).doc(id).delete();
}
//Delete all documents in a collection
export async function DBDeleteAllTestDocuments() {
    await Promise.all(collectionNames.map(async (collectionName) => {
        await DBDelete(collectionName, [[DocumentTestKey, "!=", ""]]);
    }));
}
