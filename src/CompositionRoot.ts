import { CampaignD2Query } from "./data/CampaignD2Query";
import { CampaignD2Repository } from "./data/CampaignD2Repository";
import { NotificationD2Repository } from "./data/NotificationD2Repository";
import { OrganisationUnitD2Repository } from "./data/OrganisationUnitD2Repository";
import { PageVisitedD2Repository } from "./data/PageVisitedD2Repository";
import { TargetPopulationD2Repository } from "./data/TargetPopulationD2Repository";
import { DeleteCampaignUseCase } from "./domain/usecases/DeleteCampaignUseCase";
import { GetCampaignUseCase } from "./domain/usecases/GetCampaignUseCase";
import { GetOrganisationUnitsUseCase } from "./domain/usecases/GetOrganisationUnitsUseCase";
import { GetTargetPopulationUseCase } from "./domain/usecases/GetTargetPopulationUseCase";
import { HasCampaignDataUseCase } from "./domain/usecases/HasCampaignDataUseCase";
import { ListCampaignsUseCase } from "./domain/usecases/ListCampaignsUseCase";
import { MarkPageAsVisitedUseCase } from "./domain/usecases/MarkPageAsVisitedUseCase";
import { SaveCampaignUseCase } from "./domain/usecases/SaveCampaignUseCase";
import { SaveTargetPopulationUseCase } from "./domain/usecases/SaveTargetPopulationUseCase";
import { MetadataConfig } from "./models/config";
import DbD2 from "./models/db-d2";
import { D2Api } from "./types/d2-api";

export function getCompositionRoot(options: { db: DbD2; api: D2Api; config: MetadataConfig }) {
    const { db, api, config } = options;

    const repositories = {
        campaignRepository: new CampaignD2Repository(config, db),
        notificationRepository: new NotificationD2Repository(api),
        targetPopulationRepository: new TargetPopulationD2Repository(db),
        organisationUnitRepository: new OrganisationUnitD2Repository(api),
        pageVisitedRepository: new PageVisitedD2Repository(api, {
            dataStoreNamespace: "vaccination-app",
            dataStoreKey: "pages-visited",
        }),
    };

    const queries = {
        campaignQuery: new CampaignD2Query(config, db),
    };

    return {
        campaigns: {
            list: new ListCampaignsUseCase(queries),
            get: new GetCampaignUseCase(repositories),
            save: new SaveCampaignUseCase(db, repositories),
            delete: new DeleteCampaignUseCase(db, repositories),
            hasData: new HasCampaignDataUseCase(repositories),
        },
        organisationUnits: {
            get: new GetOrganisationUnitsUseCase(repositories),
        },
        pages: {
            markAsVisited: new MarkPageAsVisitedUseCase(repositories),
        },
        targetPopulation: {
            getForCampaign: new GetTargetPopulationUseCase(repositories),
            save: new SaveTargetPopulationUseCase(repositories),
        },
    };
}

export type CompositionRoot = ReturnType<typeof getCompositionRoot>;
