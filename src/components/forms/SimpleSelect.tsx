import React from "react";
import { Select, MenuItem, FormControl, InputLabel } from "@material-ui/core";

interface SimpleSelectProps {
    value: string;
    options: Array<{ text: string; value: string }>;
    onChange: (value: string) => void;
    style?: React.CSSProperties;
    floatingLabelText?: string;
}

const SimpleSelect: React.FC<SimpleSelectProps> = props => {
    const { value, options, onChange, style, floatingLabelText } = props;

    const _onChange = (ev: React.ChangeEvent<HTMLSelectElement>) => {
        onChange(ev.target.value);
    };

    return (
        <div style={style}>
            <Wrapper label={floatingLabelText}>
                <Select value={value} onChange={_onChange}>
                    {options.map(option => (
                        <MenuItem key={option.value} value={option.value}>
                            {option.text}
                        </MenuItem>
                    ))}
                </Select>
            </Wrapper>
        </div>
    );
};

const Wrapper: React.FC<{ label?: string }> = props => {
    const { children, label } = props;

    if (label) {
        return (
            <FormControl style={styles.formControl}>
                <InputLabel>{label}</InputLabel>
                {props.children}
            </FormControl>
        );
    } else {
        return <>{children}</>;
    }
};

const styles = {
    formControl: {
        minWidth: 220,
    },
};

export default SimpleSelect;
