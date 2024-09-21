watch_directory="trees"  
build_command="forester build"  

# Function to use fswatch
use_fswatch() {
    echo "Using fswatch to monitor changes..."
    fswatch -o -e ".*" -i "\\.tree$" --event Created --event Updated --event Removed --event MovedFrom --event MovedTo "$watch_directory" | while read num; do
        $build_command
    done
}

# Function to use inotifywait
use_inotifywait() {
    echo "Using inotifywait to monitor changes..."
    while inotifywait -e modify,create,delete,move -r "$watch_directory"; do
        $build_command
    done
}

# Function to use find/stat method
use_find_stat() {
    echo "Using find/stat method to monitor changes..."
    last_update=$(date +%s)
    while true; do
        current_update=$(find "$watch_directory" -type f -newer "$watch_directory" -print -quit | wc -l)
        if [ "$current_update" != "0" ]; then
            $build_command
            last_update=$(date +%s)
        fi
        sleep 2
    done
}

# Check for available tools and use the appropriate method
$build_command
if command -v fswatch >/dev/null 2>&1; then
    use_fswatch
elif command -v inotifywait >/dev/null 2>&1; then
    use_inotifywait
else
    echo "Neither fswatch nor inotifywait found. Falling back to find/stat method."
    use_find_stat
fi