import { OrganisationUnit } from "../entities/OrganisationUnit";
import { OrganisationUnitRepository } from "../repositories/OrganisationUnitRepository";

export class GetOrganisationUnitsUseCase {
    constructor(private repositories: { organisationUnitRepository: OrganisationUnitRepository }) {}

    async execute(ids: string[]): Promise<OrganisationUnit[]> {
        return this.repositories.organisationUnitRepository.getByIds(ids);
    }
}
