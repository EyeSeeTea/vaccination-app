import React from "react";
import { Select, MenuItem, SelectProps } from "@material-ui/core";

interface SimpleSelectProps {
    value: string;
    options: Array<{ text: string; value: string }>;
    onChange: (value: string) => void;
}

type SelectOnChange = NonNullable<SelectProps["onChange"]>;

const SimpleSelect: React.FC<SimpleSelectProps> = ({ value, options, onChange }) => {
    const _onChange: SelectOnChange = ev => {
        onChange(String(ev.target.value));
    };

    return (
        <Select value={value} onChange={_onChange}>
            {options.map(option => (
                <MenuItem key={option.value} value={option.value}>
                    {option.text}
                </MenuItem>
            ))}
        </Select>
    );
};

export default SimpleSelect;
