import fs from "fs";
import _ from "lodash";
import "../utils/lodash-mixins";

import md5 from "md5";

const categoriesInfo = [
    { name: "Antigen", code: "RVC_ANTIGEN" },
    { name: "Dose", code: "RVC_DOSE" },
    { name: "Type", code: "RVC_TYPE" },
    { name: "Age group", code: "RVC_AGE_GROUP" },
    { name: "Gender", code: "RVC_GENDER" },
    { name: "Displacement Status", code: "RVC_DISTATUS" },
    { name: "Woman Status", code: "RVC_WS" },
];

const categoryComboNames = [
    "Antigen / Dose / Type / Age group",
    "Antigen / Dose / Type / Age group / Gender",
    "Antigen / Dose / Type / Age group / Displacement Status",
    "Antigen / Dose / Type / Age group / Woman Status",
    "Antigen / Dose / Type / Age group / Gender / Displacement Status",
    "Antigen / Dose / Type / Age group / Gender / Woman Status",
    "Antigen / Dose / Type / Age group / Displacement Status / Woman Status",
    "Antigen / Dose / Type / Age group / Gender / Displacement Status / Woman Status",
];

// DHIS2 UID :: /^[a-zA-Z][a-zA-Z0-9]{10}$/
const asciiLetters = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
const asciiNumbers = "0123456789";
const asciiLettersAndNumbers = asciiLetters + asciiNumbers;
const range10 = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
const uidStructure = [asciiLetters, ...range10.map(() => asciiLettersAndNumbers)];
const maxHashValue = uidStructure.map(cs => cs.length).reduce((acc, n) => acc * n, 1);

/* Return pseudo-random UID from seed prefix/key */
export function getUid(prefix: string, key: string): string {
    const seed = prefix + key;
    const md5hash = md5(seed);
    const nHashChars = Math.ceil(Math.log(maxHashValue) / Math.log(16));
    const hashInteger = parseInt(md5hash.slice(0, nHashChars), 16);
    const result = uidStructure.reduce(
        (acc, chars) => {
            const { n, uid } = acc;
            const nChars = chars.length;
            const quotient = Math.floor(n / nChars);
            const remainder = n % nChars;
            const uidChar = chars[remainder];
            return { n: quotient, uid: uid + uidChar };
        },
        { n: hashInteger, uid: "" }
    );

    return result.uid;
}

export function main() {
    const metadata = JSON.parse(fs.readFileSync("categories.json", "utf8")) as {
        categories: Array<{
            id: string;
            name: string;
            code: string;
            categoryOptions: Array<{ id: string; name: string }>;
        }>;
    };

    const categoriesMetadataByCode = _.keyBy(metadata.categories, category => category.code);

    const categoriesByName = _.keyBy(categoriesInfo, category => category.name);

    const categoryCombos = categoryComboNames.map(categoryComboName => {
        const categories = categoryComboName.split(" / ").map(name => {
            const code = categoriesByName[name]?.code;
            if (!code) throw new Error(`Category not found: name=${name}`);
            const category = categoriesMetadataByCode[code];
            if (!category) throw new Error(`Category not found: code=${code}`);
            return category;
        });

        const categoryComboCode =
            "RVC_" + categories.map(category => category.code.replace(/^RVC_/, "")).join("_");
        const categoryComboId = getUid("categoryCombo", categoryComboCode);

        const categoryOptionCombos = _.cartesianProduct(
            categories.map(category => category.categoryOptions)
        ).map(group => {
            const cocId = getUid("coc", group.map(option => option.id).join(""));

            return {
                id: cocId,
                categoryCombo: { id: categoryComboId },
                name: group.map(option => option.name).join(", "),
                categoryOptions: group.map(option => ({ id: option.id })),
            };
        });

        return {
            id: categoryComboId,
            name: categoryComboName,
            code: categoryComboCode,
            categories: categories.map(category => ({ id: category.id })),
            dataDimensionType: "DISAGGREGATION",
            categoryOptionCombos: categoryOptionCombos,
        };
    });

    const categoryOptionCombos = _(categoryCombos)
        .flatMap(categoryCombo => categoryCombo.categoryOptionCombos)
        .uniqBy(coc => coc.id)
        .value();

    const payload = {
        categoryCombos: _(categoryCombos)
            .map(categoryCombo => _.omit(categoryCombo, ["categoryOptionCombos"]))
            .value(),
        categoryOptionCombos: categoryOptionCombos,
    };

    fs.writeFileSync("categoryCombos.json", JSON.stringify(payload, null, 4));
    console.debug(`Category combos written: categoryCombos.json`);
}

main();
