import _ from "lodash";
import { getCurrentUserRoles } from "./dhis2";

export function hasCurrentUserRoles(d2, allUserRoles, roleNames) {
    const currentUserRoleIds = getCurrentUserRoles(d2);
    const userRoleIds = _(allUserRoles).keyBy("name").at(roleNames).compact().map("id").value();

    return !_(currentUserRoleIds).intersection(userRoleIds).isEmpty();
}
