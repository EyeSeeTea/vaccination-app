import _ from "lodash";
import { NamedObject } from "../models/db.types";

export function hasCurrentUserRoles(
    currentUserRoleIds: string[],
    allUserRoles: NamedObject[],
    roleNames: string[]
): boolean {
    const userRoleIds = _(allUserRoles)
        .keyBy(role => role.name)
        .at(roleNames)
        .compact()
        .map(role => role.id)
        .value();

    return !_(currentUserRoleIds).intersection(userRoleIds).isEmpty();
}
