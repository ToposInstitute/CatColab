/** Actions occuring in an input component that can affect nearby components. */
export type InputActions = {
    /** Request to delete this component and then move backward.

    Typically triggered by pressing `Backspace`.
     */
    deleteBackward?: () => void;

    /** Request to delete this component and then move forward.

    Typically triggered by pressing `Delete`.
     */
    deleteForward?: () => void;

    /** Request to exit this component and move backward. */
    exitBackward?: () => void;

    /** Request to exit this component and move forward. */
    exitForward?: () => void;

    /** Request to exit this component and move upward. */
    exitUp?: () => void;

    /** Request to exit this component and move downward. */
    exitDown?: () => void;

    /** Request to exit this component and move left. */
    exitLeft?: () => void;

    /** Request to exit this component and move right. */
    exitRight?: () => void;

    /** Called when this component gains focus. */
    onFocus?: () => void;
};
