import pandas as pd
import matplotlib.pyplot as plt
import numpy as np

# Load your data - adjust the file path and columns as needed
# Expected data format: columns for 'school', 'status', and any other relevant fields
# Status values should be 'withdrawn', 'denied', or 'completed'
# Data should include an 'archived' column or marker

# Example: df = pd.read_csv('path_to_your_data.csv')
# For now, assuming data is loaded from a CSV file

def create_status_bar_chart(data_file, output_file='status_by_school.png'):
    """
    Create a stacked bar chart showing percentage of student statuses by school.
    
    Parameters:
    - data_file: path to CSV containing student data
    - output_file: path where the chart will be saved
    
    Expected columns: 'school', 'status', 'archived' (or similar marker)
    Status values: 'withdrawn', 'denied', 'completed'
    """
    
    # Read the data
    df = pd.read_csv(data_file)
    
    # Filter for archived data only
    df_archived = df[df['archived'] == True]  # Adjust the column name as needed
    
    # Count students by school and status
    status_counts = df_archived.groupby(['school', 'status']).size().unstack(fill_value=0)
    
    # Calculate percentages
    status_percentages = status_counts.div(status_counts.sum(axis=1), axis=0) * 100
    
    # Define colors for each status
    colors = {
        'withdrawn': '#FF6B6B',    # Red
        'denied': '#FFA500',        # Orange
        'completed': '#4CAF50'      # Green
    }
    
    # Create the stacked bar chart
    fig, ax = plt.subplots(figsize=(12, 6))
    
    status_percentages.plot(
        kind='bar',
        stacked=True,
        ax=ax,
        color=[colors.get(col, '#808080') for col in status_percentages.columns],
        edgecolor='black',
        linewidth=0.5
    )
    
    # Customize the chart
    ax.set_xlabel('School', fontsize=12, fontweight='bold')
    ax.set_ylabel('Percentage (%)', fontsize=12, fontweight='bold')
    ax.set_title('Student Status Distribution by School (Archived Data)', fontsize=14, fontweight='bold')
    ax.set_ylim(0, 100)
    ax.legend(title='Status', bbox_to_anchor=(1.05, 1), loc='upper left')
    ax.grid(axis='y', alpha=0.3)
    
    # Rotate x-axis labels for better readability
    plt.xticks(rotation=45, ha='right')
    
    # Tight layout to prevent label cutoff
    plt.tight_layout()
    
    # Save the figure
    plt.savefig(output_file, dpi=300, bbox_inches='tight')
    print(f"Chart saved to {output_file}")
    
    plt.show()

# Usage
if __name__ == "__main__":
    # Replace with your actual data file path
    create_status_bar_chart('path_to_your_data.csv')
