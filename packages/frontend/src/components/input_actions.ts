/** Actions invokable in an input component but affecting nearby components. */
export type InputActions = {
    /** Request to delete this component and then move backward.

    Here "backward" means left or, if at the left boundary, then up. Typically
    triggered by pressing `Backspace`.
     */
    deleteBackward?: () => void;

    /** Request to delete this component and then move forward.

    Here "forward" means right or, if at the right boundary, then down.
    Typically triggered by pressing `Delete`.
     */
    deleteForward?: () => void;

    /** Request to exit this component and move backward.

    Here "backward" can mean left or up with possiblity of cycling. Typically
    triggered by pressing `Tab`.
     */
    exitBackward?: () => void;

    /** Request to exit this component and move forward.

    Here "forward" can mean right or down with possibility of cycling. Typically
    triggered by pressing `Shift + Tab`.
     */
    exitForward?: () => void;

    /** Request to exit this component and move upward. */
    exitUp?: () => void;

    /** Request to exit this component and move downward. */
    exitDown?: () => void;

    /** Request to exit this component and move left. */
    exitLeft?: () => void;

    /** Request to exit this component and move right. */
    exitRight?: () => void;

    /** This component has received focus. */
    hasFocused?: () => void;
};
