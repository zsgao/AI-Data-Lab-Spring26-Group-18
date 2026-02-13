import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
from pathlib import Path

here = Path(__file__).resolve().parent
csv_file = here.parent / "CSV-Data" / "rotation_schedule_data_2023-2024_Deidentified_v2.csv"

if not csv_file.exists():
	raise FileNotFoundError(f"CSV file not found: {csv_file}") # for finding the directory of the csv file

df = pd.read_csv(csv_file)

# Precepted Hours per Person
plt.figure(figsize=(20, 6))
plt.xlabel('Hours Worked by Students')
plt.ylabel('Number of Students')
plt.title("Precepted Rotation: Distribution of Hours Worked by Students")

bins = list(range(0, 215, 5))

plt.hist(df[df['Experience'] == 'Precepted Rotation']['Total Hours per Person'], bins=bins, alpha=0.7, color='blue')

plt.grid(True, linestyle='--', alpha=0.5)
plt.show()

# Cohort Hours per Person
plt.figure(figsize=(20, 6))
plt.xlabel('Hours Worked by Students')
plt.ylabel('Number of Students')
plt.title("Cohort Rotation - SON: Distribution of Hours Worked by Students")

bins = list(range(0, 215, 5))

plt.hist(df[df['Experience'] == 'Cohort Rotation']['Total Hours per Person'], bins=bins, alpha=0.7, color='blue')

plt.grid(True, linestyle='--', alpha=0.5)
plt.show()

# Emory University - SON
plt.figure(figsize=(20, 6))
plt.xlabel('Hours Worked by Students')
plt.ylabel('Number of Students')
plt.title("Emory University - SON: Distribution of Hours Worked by Students")

bins = list(range(0, 215, 5))

plt.hist(df[df['Schools'] == 'Emory University - SON']['Total Hours per Person'], bins=bins, alpha=0.7, color='blue')

plt.grid(True, linestyle='--', alpha=0.5)
plt.show()

# Emory University - SON Pre-licensure
plt.figure(figsize=(20, 6))
plt.xlabel('Hours Worked by Students')
plt.ylabel('Number of Students')
plt.title("Emory University - SON Pre-licensure: Distribution of Hours Worked by Students")

bins = list(range(0, 215, 5))

plt.hist(df[df['Schools'] == 'Emory University - SON Pre-licensure']['Total Hours per Person'], bins=bins, alpha=0.7, color='blue')

plt.grid(True, linestyle='--', alpha=0.5)
plt.show()

# Excelsior University
plt.figure(figsize=(20, 6))
plt.xlabel('Hours Worked by Students')
plt.ylabel('Number of Students')
plt.title("Excelsior University: Distribution of Hours Worked by Students")

bins = list(range(0, 215, 5))

plt.hist(df[df['Schools'] == 'Excelsior University']['Total Hours per Person'], bins=bins, alpha=0.7, color='blue')

plt.grid(True, linestyle='--', alpha=0.5)
plt.show()

# Georgia Baptist College of Nursing of Mercer University - Undergraduate Nursing
plt.figure(figsize=(20, 6))
plt.xlabel('Hours Worked by Students')
plt.ylabel('Number of Students')
plt.title("Georgia Baptist College of Nursing of Mercer University - Undergraduate Nursing: Distribution of Hours Worked by Students")

bins = list(range(0, 215, 5))

plt.hist(df[df['Schools'] == 'Georgia Baptist College of Nursing of Mercer University - Undergraduate Nursing']['Total Hours per Person'], bins=bins, alpha=0.7, color='blue')

plt.grid(True, linestyle='--', alpha=0.5)
plt.show()

# Georgia Baptist College of Nursing of Mercer University - Undergraduate Nursing - Atlanta
plt.xlabel('Hours Worked by Students')
plt.ylabel('Number of Students')
plt.title("Georgia Baptist College of Nursing of Mercer University - Undergraduate Nursing - Atlanta: Distribution of Hours Worked by Students")

bins = list(range(0, 215, 5))

plt.hist(df[df['Schools'] == 'Georgia Baptist College of Nursing of Mercer University - Undergraduate Nursing - Atlanta']['Total Hours per Person'], bins=bins, alpha=0.7, color='blue')

plt.grid(True, linestyle='--', alpha=0.5)
plt.show()

# Georgia College & State University - Nursing
plt.xlabel('Hours Worked by Students')
plt.ylabel('Number of Students')
plt.title("Georgia College & State University - Nursing: Distribution of Hours Worked by Students")

bins = list(range(0, 215, 5))

plt.hist(df[df['Schools'] == 'Georgia College & State University - Nursing']['Total Hours per Person'], bins=bins, alpha=0.7, color='blue')

plt.grid(True, linestyle='--', alpha=0.5)
plt.show()

# Georgia Gwinnett College
plt.xlabel('Hours Worked by Students')
plt.ylabel('Number of Students')
plt.title("Georgia Gwinnett College: Distribution of Hours Worked by Students")

bins = list(range(0, 215, 5))

plt.hist(df[df['Schools'] == 'Georgia Gwinnett College']['Total Hours per Person'], bins=bins, alpha=0.7, color='blue')

plt.grid(True, linestyle='--', alpha=0.5)
plt.show()
