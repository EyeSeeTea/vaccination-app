import _ from "lodash";
import {
    D2CategoryCombo,
    D2CategoryOptionGroup,
    D2DataElementGroup,
    D2DataSet,
    D2Section,
    D2User,
} from "../types/d2-api";

// Process and stabilize D2 metadata responses for snapshot testing and better diffing.
// Remove non-deterministic data and keep array sorted (when that order is irrelevant for DHIS2)

export type D2MetadataResponse = Partial<{
    system: unknown;
    dataSets: D2DataSet[];
    dataElementGroups: D2DataElementGroup[];
    sections: D2Section[];
    categoryOptionGroups: D2CategoryOptionGroup[];
    users: D2User[];
    categoryCombos: D2CategoryCombo[];
}> &
    Record<string, unknown[]>;

export function stabilizeD2MetadataResponse(d2Response: D2MetadataResponse): D2MetadataResponse {
    if (!d2Response.system) return d2Response;

    const { system: _system, ...metadata } = d2Response;

    const nested = {
        ...metadata,

        ...(metadata.dataElementGroups
            ? {
                  dataElementGroups: metadata.dataElementGroups.map(dataElementGroup => ({
                      ...dataElementGroup,
                      dataElements: _.sortBy(
                          dataElementGroup.dataElements,
                          dataElement => dataElement.id
                      ),
                  })),
              }
            : {}),

        ...(metadata.dataSets
            ? {
                  dataSets: (metadata.dataSets || []).map(dataSet => {
                      return {
                          ...dataSet,
                          version: 1,
                          ...(dataSet.dataSetElements
                              ? {
                                    dataSetElements: _.sortBy(
                                        dataSet.dataSetElements,
                                        dataSetElement => dataSetElement.dataElement.id
                                    ),
                                }
                              : {}),
                      };
                  }),
              }
            : {}),

        ...(metadata.sections
            ? {
                  sections: (metadata.sections || []).map(section => ({
                      ...section,
                      greyedFields: _.sortBy(section.greyedFields, greyedField =>
                          [greyedField.dataElement.id, greyedField.categoryOptionCombo.id].join(".")
                      ),
                  })),
              }
            : {}),

        ...(metadata.categoryOptionGroups
            ? {
                  categoryOptionGroups: (metadata.categoryOptionGroups || []).map(
                      categoryOptionGroup => {
                          return {
                              ...categoryOptionGroup,
                              categoryOptions: _.sortBy(
                                  categoryOptionGroup.categoryOptions,
                                  categoryOption => categoryOption.id
                              ),
                          };
                      }
                  ),
              }
            : {}),

        ...(metadata.users
            ? {
                  users: metadata.users.map(user => ({
                      ...user,
                      userCredentials: {
                          ...user.userCredentials,
                          userRoles: _.sortBy(
                              user.userCredentials.userRoles,
                              userRole => userRole.id
                          ),
                      },
                  })),
              }
            : {}),

        ...(metadata.categoryCombos
            ? {
                  categoryCombos: metadata.categoryCombos.map(categoryCombo => ({
                      ...categoryCombo,
                      ...(categoryCombo.categoryOptionCombos
                          ? {
                                categoryOptionCombos: _.sortBy(
                                    categoryCombo.categoryOptionCombos.map(categoryOptionCombo => ({
                                        ...categoryOptionCombo,
                                        categoryOptions: _.sortBy(
                                            categoryOptionCombo.categoryOptions,
                                            categoryOption => categoryOption.id
                                        ),
                                    })),
                                    categoryOptionCombo => categoryOptionCombo.id
                                ),
                            }
                          : {}),
                  })),
              }
            : {}),
    };

    removeNestedPropertiesInPlace(nested, "lastUpdated");
    traverseCollectionItemsInplace<User>(nested, "users", anonymizeUser);
    traverseObjInPlace<string>(nested, "name", anonymizeTeamName);

    return nested;
}

type User = {
    name?: string;
    displayName?: string;
    username?: string;
};

/**
 * Recursively traverse any JS object and apply a callback to each item
 * in any <prop> array found (at any depth).
 */
function traverseCollectionItemsInplace<Item>(
    obj: unknown,
    prop: string,
    processItem: (item: Item) => void
): void {
    if (Array.isArray(obj)) {
        for (const item of obj) {
            traverseCollectionItemsInplace(item, prop, processItem);
        }
    } else if (obj && typeof obj === "object") {
        for (const [key, value] of Object.entries(obj)) {
            if (key === prop && Array.isArray(value)) {
                for (const user of value) {
                    processItem(user);
                }
            } else {
                traverseCollectionItemsInplace(value, prop, processItem);
            }
        }
    }
}

/**
 * Recursively traverse any JS object and apply a transform to each item
 * in any <prop> found (at any depth).
 *
 * const obj = {x: {y: {name: "Hello"}}}
 * traverseObjInPlace(obj, "name", s => s.toUpperCase())
 * // obj is now {x: {y: {name: "HELLO"}}}
 */
function traverseObjInPlace<Item>(
    obj: unknown,
    prop: string,
    transform: (item: Item) => Item
): void {
    if (Array.isArray(obj)) {
        for (const item of obj) {
            traverseObjInPlace(item, prop, transform);
        }
    } else if (obj && typeof obj === "object") {
        for (const [key, value] of Object.entries(obj)) {
            if (key === prop) {
                (obj as any)[key] = transform(value as Item);
            } else {
                traverseObjInPlace(value, prop, transform);
            }
        }
    }
}

function removeNestedPropertiesInPlace(obj: unknown, prop: string): void {
    if (Array.isArray(obj)) {
        for (const item of obj) {
            removeNestedPropertiesInPlace(item, prop);
        }
    } else if (obj && typeof obj === "object") {
        for (const [key, value] of Object.entries(obj)) {
            if (key === prop) {
                delete (obj as any)[key];
            } else {
                removeNestedPropertiesInPlace(value, prop);
            }
        }
    }
}

function hashString(input: string): number {
    let hash = 0;
    for (let i = 0; i < input.length; i++) {
        hash = (hash << 5) - hash + input.charCodeAt(i);
        hash |= 0;
    }
    return Math.abs(hash);
}

function anonymizeUser(user: User): void {
    const seed = user.username ?? user.displayName ?? user.name ?? "unknown";

    const hash = hashString(seed);

    if (user.username) user.username = `user_${hash}`;
    if (user.name) user.name = `User ${hash % 10000}`;
    if (user.displayName) user.displayName = `User ${hash % 10000}`;
}

// "Team 001 - CAMPAIGN_NAME" -> "Team 001 - 1234"
function anonymizeTeamName(name: string): string {
    // match "Team XXX - " at the start of the string and keep it, replace the rest with a hash
    const match = name.match(/^(Team \d+ - )/);
    if (!match) return name;
    const prefix = match ? match[1] : "";
    const hash = hashString(name);
    return prefix + (hash % 100000).toString();
}
