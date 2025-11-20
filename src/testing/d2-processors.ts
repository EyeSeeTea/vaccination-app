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
}>;

export function stabilizeD2MetadataResponse(d2Response: D2MetadataResponse): D2MetadataResponse {
    if (!d2Response.system) return d2Response;

    const { system: _system, ...metadata } = d2Response;

    return {
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
                  dataSets: (metadata.dataSets || []).map(dataSet => ({
                      ...dataSet,
                      ...(dataSet.dataSetElements
                          ? {
                                dataSetElements: _.sortBy(
                                    dataSet.dataSetElements,
                                    dataSetElement => dataSetElement.dataElement.id
                                ),
                            }
                          : {}),
                  })),
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
}
