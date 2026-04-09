import pandas as pd

# load full data
rot_data=pd.read_excel('rotation_schedule_data_2023-25deid.xlsx')
viz_data=pd.read_excel('Vizient_Data_v3.xlsx')

# create cleaned status column
status_map={
    'Archived (Completed)': 'Completed',
    'Archived (Withdrawn)': 'Withdrawn',
    'Archived (Denied)': 'Denied'
}
rot_data['Cleaned Status']=rot_data['Status'].replace(status_map)

# create cohort column
rot_data['Start Date']=pd.to_datetime(rot_data['Start Date'])
rot_data['Year']=rot_data['Start Date'].dt.year
rot_data['Cohort']=rot_data['Start Date'].dt.month.apply(lambda x: 'Spring' if x<=4 else 'Summer' if x<=8 else 'Fall')+" "+rot_data['Year'].astype(str)
# print(df[['Schools', 'Start Date', 'Status', 'Cleaned Status', 'Year', 'Cohort']].head())

# new data frame with only data that was part of completed cohort rotation
df_cohorts_completed=rot_data[(rot_data['Experience']=='Cohort Rotation')&(rot_data['Cleaned Status']=='Completed')].copy()
# separating each row in order to have a row for each student
df_cohorts_completed['Students']=df_cohorts_completed['Students'].astype(str)
df_cohorts_completed['Students']=df_cohorts_completed['Students'].str.split(',')
df_cohorts_completed=df_cohorts_completed.explode('Students')
df_cohorts_completed['Students']=df_cohorts_completed['Students'].str.strip()
df_cohorts_completed['Students']=pd.to_numeric(df_cohorts_completed['Students'],'coerce').astype('Int64')

# new data frame with only schools that had more than two complete cohorts
school_cohorts=df_cohorts_completed['Schools'].value_counts()
schools=school_cohorts[school_cohorts>=2].index
# print(df.loc[~df['Schools'].isin(schools),'Schools'].unique())
# print(df.loc[df['Schools'].isin(schools),'Schools'].unique())
df_accurate_sample=df_cohorts_completed[df_cohorts_completed['Schools'].isin(schools)]

# create tier column
# tier 1 keywords (premier)
tier_1_keywords = [
    'emory', 'ksu', 'mercer', 'gsu', 'georgia state university',
    'middle ga state university', 'middle georgia state', 'central ga tech', 'central georgia tech',
    'chamberlain', 'university north ga', 'university of north georgia',
    'fort valley state university', 'ga college & state university', 'georgia college & state',
    'ga gwinnett college', 'georgia gwinnett'
]
# tier 2 keywords (preferred)
tier_2_keywords = [
    'albany state', 'auburn', 'brenau', 'ga southern', 'georgia southern',
    'university of west ga', 'university of west georgia',
    'clemson university', 'augusta university'
]
def assign_tier(school):
    if pd.isna(school):
        return 0
    school_lower = str(school).lower()
    # check for tier 1 matches
    if any(keyword in school_lower for keyword in tier_1_keywords):
        return 1
    # check for tier 2 matches
    if any(keyword in school_lower for keyword in tier_2_keywords):
        return 2
    # default if no match
    return 0
rot_data['Tier'] = rot_data['Schools'].apply(assign_tier)
# print(df[['Schools', 'Tier', 'Cleaned Status', 'Year', 'Cohort']].head())

# merging rot data for students at schools that have two or more completed cohorts with viz data - returns 392 students
df_accurate_sample['Students']=pd.to_numeric(df_accurate_sample['Students'],'coerce').astype('Int64')
viz_data['ID']=viz_data['ID'].astype('Int64')
rot_and_viz=df_accurate_sample.merge(viz_data, 'inner', left_on='Students', right_on='ID')
rot_and_viz.to_csv('~/rot_and_viz_merged.csv', index=False)

# cleaning school names to match viz
df_accurate_sample.columns=df_accurate_sample.columns.str.strip()
school_mapping = {
    'Chamberlain College of Nursing - Georgia': 'Chamberlain University',  # no match in Vizient - i think there is? maybe was just in new
    'Chamberlain College of Nursing - Atlanta': 'Chamberlain University',  # no match in Vizient
    'Georgia Baptist College of Nursing of Mercer University - Undergraduate Nursing': 'Mercer University',
    'Georgia Baptist College of Nursing of Mercer University - Undergraduate Nursing - Atlanta': 'Mercer University',
    'Kennesaw State University - Nursing': 'Kennesaw State University',
    'Emory University - SON Pre-licensure': 'Emory University',
    'Georgia State University - Perimeter College': 'Georgia State University',
    'Georgia State University - SON - Undergraduate': 'Georgia State University',
    'University of North Georgia - Nursing': 'University Of North Georgia',
    'Georgia Gwinnett College': 'Georgia Gwinnett College',
    'South College - Atlanta Campus - Nursing': 'South College Atlanta'
}
df_accurate_sample['School_Cleaned']=df_accurate_sample['Schools'].map(school_mapping)
df_accurate_sample['School_Cleaned']=df_accurate_sample['School_Cleaned'].fillna(df_accurate_sample['Schools'])
# print(df_accurate_sample[['Schools', 'School_Cleaned']].head(20))
df_accurate_sample.to_csv('~/df_accurate_sample_cleanedNames.csv', index=False)

# cleaning viz data
viz_data.columns=viz_data.columns.str.strip()
viz_data['Age']=pd.to_numeric(viz_data['Age'], 'coerce')
viz_data=viz_data[(viz_data['Age']<65) & (viz_data['Age'].notna())]
valid_schools = {
    "Abraham Baldwin Agricultural Program (Abac)",
    "Albany State University",
    "American Sentinel College",
    "Atlanta Technical College",
    "Auburn University School Of Nursing Main Campus",
    "Augusta University",
    "Baylor University",
    "Brenau University",
    "Capella University",
    "Chamberlain College Of Nursing",
    "Columbus State University",
    "Dalton State College",
    "Duke University",
    "Emory University",
    "Fort Valley State University",
    "Georgia College And State University",
    "Georgia Gwinnett College",
    "Georgia Highlands College",
    "Georgia State University",
    "Gordon State College",
    "Grand Canyon",
    "Herzing University",
    "Indiana University",
    "Jacksonville University",
    "Kennesaw State University",
    "Mercer University",
    "Middle Georgia State",
    "Reinhardt University",
    "South College Atlanta",
    "Thomas University",
    "University Of Alabama Birmingham",
    "University Of Cincinnati",
    "University Of North Georgia",
    "University Of Pittsburgh",
    "University Of South Carolina",
    "University Of Tennessee",
    "University Of West Georgia",
    "Vanderbilt University",
    "Walden University",
    "Western Governor'S University",
    "Xavier University"
}
viz_data['Cleaned Education']=viz_data['Education'].str.title()
viz_data=viz_data[viz_data['Cleaned Education'].isin(valid_schools)]
viz_data=viz_data[viz_data['Previous health care work experience'].isna()]
if 'Termination Updated By' in viz_data.columns:
    viz_data=viz_data.drop(columns=['Termination Updated By'])
if 'Education' in viz_data.columns:
    viz_data=viz_data.drop(columns=['Education'])
gpa_map = {
    "3.5 And Above": 3.75,
    "3.0 - 3.49": 3.25,
    "2.5 - 2.99": 2.75,
    "2.0 - 2.49": 2.25,
    "Below 2.0": 1.75
}
viz_data['GPA']=(
    viz_data['GPA']
    .astype(str)
    .str.strip()
    .str.title()
)
viz_data['GPA_Numeric']=viz_data['GPA'].map(gpa_map)
viz_data=viz_data[viz_data['GPA_Numeric'].notna()]
viz_data.to_csv("~/Vizient_CLEANED_FINAL.csv", index=False)