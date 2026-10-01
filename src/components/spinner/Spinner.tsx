import React from "react";
import CircularProgress from "@material-ui/core/CircularProgress";

type SpinnerProps = {
    isLoading: boolean;
};

class Spinner extends React.Component<SpinnerProps> {
    render() {
        const { isLoading } = this.props;
        return isLoading ? <CircularProgress /> : null;
    }
}

export default Spinner;
