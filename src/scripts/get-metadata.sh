#!/bin/bash
set -e -u -o pipefail

codes=(
    # categoryOptions
    RVC_REACTIVE
    RVC_PREVENTIVE
    RVC_ANTIGEN_TETANUS
    CHILDBEARING_AGE
    PREGNANT

    # categories
    RVC_TYPE
    RVC_ANTIGEN
    RVC_WS

    # categoryCombos
    RVC_DE_DOSES_ADMINISTERED_REQUIRED
    RVC_DE_DOSES_ADMINISTERED_TETANUS_OPTIONAL
    RVC_ANTIGEN
    RVC_ANTIGEN_SEVERITY

    RVC_ANTIGEN_DOSE_TYPE_AGE_GROUP
    RVC_ANTIGEN_DOSE_TYPE_AGE_GROUP_GENDER
    RVC_ANTIGEN_DOSE_TYPE_AGE_GROUP_DISTATUS
    RVC_ANTIGEN_DOSE_TYPE_AGE_GROUP_WS
    RVC_ANTIGEN_DOSE_TYPE_AGE_GROUP_GENDER_DISTATUS
    RVC_ANTIGEN_DOSE_TYPE_AGE_GROUP_GENDER_WS
    RVC_ANTIGEN_DOSE_TYPE_AGE_GROUP_DISTATUS_WS
    RVC_ANTIGEN_DOSE_TYPE_AGE_GROUP_GENDER_DISTATUS_WS

    # categoryOptionGroups
    RVC_ANTIGEN_TYPE_SELECTABLE
    RVC_ANTIGEN_TETANUS_DOSES
    RVC_ANTIGEN_TETANUS_AGE_GROUP

    # dataElementGroups
    RVC_ANTIGEN_TETANUS_OPTIONAL
    RVC_ANTIGEN_TETANUS_REQUIRED
)

output="metadata-vaccination.json.gz"
codes_param=$(echo "${codes[@]}" | xargs | sed "s/ /,/g")
params="filter=code:in:[$codes_param]&fields=:owner,categoryOptionCombos[:owner]"

curl-msf "http://localhost:8097/api/metadata.json?$params" |
    jq '
        (.categoryCombos | map(.categoryOptionCombos) | flatten) as $cocs | 
        del(.system, .categoryCombos[].categoryOptionCombos) |
        (. * {categoryOptionCombos: $cocs})
    ' | gzip >"$output"

zcat "$output" |
    jq 'del(.system, .categoryOptionCombos) | map_values(map(.code))'

echo "Written: $output" >&2
