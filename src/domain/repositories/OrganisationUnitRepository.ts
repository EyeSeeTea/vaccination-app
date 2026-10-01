import { OrganisationUnit } from "../entities/OrganisationUnit";

export interface OrganisationUnitRepository {
    getByIds(ids: string[]): Promise<OrganisationUnit[]>;
}
